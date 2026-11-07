import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_storage/firebase_storage.dart';

/// Centralized Firebase service for the TechCart Mobile app.
/// Uses existing Firestore collections: users, product, orders, customer_locations,
/// plus app-managed collections: categories, cart, favorites, reviews, notifications, promotions, payments.
/// Collections/documents are created automatically on first write. No card numbers/CVV are stored.
class FirebaseService {
  FirebaseService._internal();
  static final FirebaseService instance = FirebaseService._internal();
  factory FirebaseService() => instance;

  FirebaseAuth get auth => FirebaseAuth.instance;
  FirebaseFirestore get firestore => FirebaseFirestore.instance;
  FirebaseStorage get storage => FirebaseStorage.instance;

  User? get currentUser => auth.currentUser;
  Stream<User?> get authStateChanges => auth.authStateChanges();

  static Future<void> init() async {
    await Firebase.initializeApp();
  }

  /// Best-effort profile sync. Never blocks auth or checkout; rules/admin setup is validated by guarded writes.
  Future<void> ensureUserProfile({String? fullName, String? roleIfMissing}) async {
    final user = auth.currentUser;
    if (user == null) return;
    final ref = firestore.collection('users').doc(user.uid);
    try {
      final snap = await ref.get();
      if (!snap.exists) {
        await ref.set({
          'uid': user.uid,
          'email': user.email ?? '',
          'fullName': (fullName ?? user.displayName ?? user.email?.split('@').first ?? 'User').trim(),
          'role': roleIfMissing ?? 'customer', // never self-assigned admin
          'createdAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
        });
        return;
      }
      // Never overwrite role here.
      await ref.set({
        'uid': user.uid,
        'email': user.email ?? snap.data()?['email'] ?? '',
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    } catch (e) {
      print('[FirebaseService] ensureUserProfile skipped (publish firestore.rules / check users/{uid}): $e');
    }
  }

  // ━━━ AUTHENTICATION ━━━
  Future<UserCredential> signUp({required String email, required String password, required String fullName}) async {
    final cred = await auth.createUserWithEmailAndPassword(email: email, password: password);
    await cred.user?.updateDisplayName(fullName);
    try {
      await firestore.collection('users').doc(cred.user!.uid).set({
        'uid': cred.user!.uid, 'email': email, 'fullName': fullName,
        'role': 'customer', // never self-assigned admin
        'createdAt': FieldValue.serverTimestamp(), 'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    } catch (e) {
      print('[FirebaseService] signUp profile write failed (publish corrected firestore.rules): $e');
    }
    return cred;
  }

  Future<UserCredential> signIn({required String email, required String password}) async =>
      auth.signInWithEmailAndPassword(email: email, password: password);
  Future<void> signOut() async => auth.signOut();

  Future<bool> isAdmin() async {
    final user = auth.currentUser; if (user == null) return false;
    final doc = await firestore.collection('users').doc(user.uid).get();
    return doc.data()?['role'] == 'admin';
  }

  Future<String> getUserRole() async {
    final user = auth.currentUser; if (user == null) return 'customer';
    try {
      final doc = await firestore.collection('users').doc(user.uid).get();
      final role = (doc.data()?['role'] ?? '').toString();
      return role.isEmpty ? 'customer' : role;
    } catch (_) {
      return 'customer';
    }
  }

  Future<Map<String, dynamic>?> getUserProfile() async {
    final user = auth.currentUser; if (user == null) return null;
    final doc = await firestore.collection('users').doc(user.uid).get();
    return doc.data();
  }

  // ━━━ PRODUCT (singular collection, existing data preserved) ━━━
  // Real-time listener with diagnostics. Reads Firestore collection "product" (singular).
  Stream<List<Map<String, dynamic>>> streamProducts() {
    final col = firestore.collection('product');
    final projectId = firestore.app.options.projectId ?? '(unknown)';
    final uid = auth.currentUser?.uid ?? '(not signed in)';
    print('[FirebaseService][products] project=$projectId uid=$uid collection=product');

    final controller = StreamController<List<Map<String, dynamic>>>.broadcast();
    StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? orderedSub;
    StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? unorderedSub;
    var orderedHadData = false;

    void emit(QuerySnapshot<Map<String, dynamic>> snap, String source) {
      final rows = snap.docs.map((d) => <String, dynamic>{...d.data(), 'id': d.id}).toList();
      print('[FirebaseService][products] $source: ${rows.length} doc(s) from "product" (project=$projectId)');
      if (!controller.isClosed) controller.add(rows);
      if (rows.isEmpty) {
        print('[FirebaseService][products] no visible docs. Check: same project ($projectId), collection "product" (singular) has documents, user is signed in, and Firestore rules are PUBLISHED for signed-in read of "product". Permission errors appear as stream errors.');
      }
    }

    void startUnordered(String reason) {
      if (unorderedSub != null) return;
      print('[FirebaseService][products] starting unordered fallback: $reason');
      unorderedSub = col.snapshots().listen(
        (snap) => emit(snap, 'unordered snapshot'),
        onError: (Object e, StackTrace st) {
          print('[FirebaseService][products] unordered snapshot error: $e');
          print(st);
          if (!controller.isClosed) controller.addError(e, st);
        },
      );
    }

    orderedSub = col.orderBy('updatedAt', descending: true).snapshots().listen(
      (snap) {
        if (snap.docs.isNotEmpty) orderedHadData = true;
        if (!orderedHadData && snap.docs.isEmpty) {
          // Ordered query can be empty due to missing updatedAt on older docs; try unordered in parallel once.
          startUnordered('ordered snapshot empty (missing updatedAt/index/order mismatch)');
        }
        emit(snap, 'ordered snapshot');
      },
      onError: (Object e, StackTrace st) {
        print('[FirebaseService][products] ordered snapshot error (may need index/rules): $e');
        print(st);
        startUnordered('ordered snapshot failed');
        // Also surface the original error so UI can report permission-denied clearly.
        if (!controller.isClosed) controller.addError(e, st);
      },
    );

    controller.onCancel = () async {
      await orderedSub?.cancel();
      await unorderedSub?.cancel();
    };
    return controller.stream;
  }

  Future<List<Map<String, dynamic>>> fetchProducts() async {
    final col = firestore.collection('product');
    final projectId = firestore.app.options.projectId ?? '(unknown)';
    final uid = auth.currentUser?.uid ?? '(not signed in)';
    try {
      final snap = await col.orderBy('updatedAt', descending: true).get();
      print('[FirebaseService][products] fetch ordered: ${snap.docs.length} from "product" project=$projectId uid=$uid');
      if (snap.docs.isEmpty) {
        final fallback = await col.get();
        print('[FirebaseService][products] fetch unordered fallback: ${fallback.docs.length} from "product"');
        return fallback.docs.map((d) => <String, dynamic>{...d.data(), 'id': d.id}).toList();
      }
      return snap.docs.map((d) => <String, dynamic>{...d.data(), 'id': d.id}).toList();
    } catch (e, st) {
      print('[FirebaseService][products] fetch ordered failed: $e');
      print(st);
      final snap = await col.get();
      print('[FirebaseService][products] fetch unordered: ${snap.docs.length} from "product" project=$projectId uid=$uid');
      return snap.docs.map((d) => <String, dynamic>{...d.data(), 'id': d.id}).toList();
    }
  }

  Future<Map<String, dynamic>?> getProduct(String id) async { final d = await firestore.collection('product').doc(id).get(); return d.data(); }
  Future<String> addProduct(Map<String, dynamic> data) async { final r = await firestore.collection('product').add({...data, 'createdAt': FieldValue.serverTimestamp(), 'updatedAt': FieldValue.serverTimestamp()}); return r.id; }
  Future<void> updateProduct(String id, Map<String, dynamic> updates) async => firestore.collection('product').doc(id).update({...updates, 'updatedAt': FieldValue.serverTimestamp()});
  Future<void> deleteProduct(String id) async => firestore.collection('product').doc(id).delete();

  // ━━━ ORDERS (existing collection) ━━━
  Stream<List<Map<String, dynamic>>> streamOrders() => firestore.collection('orders').orderBy('createdAt', descending: true).snapshots()
      .map((s) => s.docs.map((d) => <String, dynamic>{...d.data(), 'id': d.id}).toList());
  Stream<List<Map<String, dynamic>>> streamMyOrders(String customerId) {
    List<Map<String, dynamic>> map(QuerySnapshot<Map<String, dynamic>> s) =>
        s.docs.map((d) => <String, dynamic>{...d.data(), 'id': d.id}).toList();
    Query<Map<String, dynamic>> ordered() => firestore.collection('orders')
        .where('customerId', isEqualTo: customerId).orderBy('createdAt', descending: true);
    Query<Map<String, dynamic>> unordered() => firestore.collection('orders')
        .where('customerId', isEqualTo: customerId);
    late final StreamController<List<Map<String, dynamic>>> ctrl;
    StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? sub;
    Future<void> listen(Query<Map<String, dynamic>> q, {required bool canFallback}) async {
      await sub?.cancel();
      sub = q.snapshots().listen((s) {
        if (!ctrl.isClosed) ctrl.add(map(s));
      }, onError: (e, st) async {
        final msg = e.toString();
        final needsFallback = canFallback && (msg.contains('failed-precondition') || msg.contains('index') || msg.contains('FAILED_PRECONDITION'));
        print('[FirebaseService][orders] query error customerId=$customerId canFallback=$canFallback: $msg');
        if (needsFallback) {
          print('[FirebaseService][orders] retrying without orderBy (create orders index customerId+createdAt for best results)');
          await listen(unordered(), canFallback: false);
          return;
        }
        if (!ctrl.isClosed) ctrl.addError(e, st);
      });
    }
    ctrl = StreamController<List<Map<String, dynamic>>>(
      onListen: () => listen(ordered(), canFallback: true),
      onCancel: () async { await sub?.cancel(); },
    );
    return ctrl.stream;
  }
  Future<Map<String, dynamic>?> getOrder(String id) async { final d = await firestore.collection('orders').doc(id).get(); return d.exists ? <String, dynamic>{...?d.data(), 'id': d.id} : null; }
  Future<String> createOrder(Map<String, dynamic> data) async { final r = await firestore.collection('orders').add({...data, 'createdAt': FieldValue.serverTimestamp(), 'updatedAt': FieldValue.serverTimestamp()}); return r.id; }
  Future<void> updateOrderStatus(String id, String status) async => firestore.collection('orders').doc(id).update({'orderStatus': status, 'updatedAt': FieldValue.serverTimestamp()});

  // ━━━ USERS ━━━
  Stream<List<Map<String, dynamic>>> streamUsers() => firestore.collection('users').orderBy('createdAt', descending: true).snapshots()
      .map((s) => s.docs.map((d) => d.data()).toList());
  Future<void> updateUserRole(String uid, String role) async => firestore.collection('users').doc(uid).update({'role': role, 'updatedAt': FieldValue.serverTimestamp()});

  // ━━━ CATEGORIES (admin manages; signed-in users browse) ━━━
  Stream<List<Map<String, dynamic>>> streamCategories() => firestore.collection('categories').orderBy('updatedAt', descending: true).snapshots()
      .map((s) => s.docs.map((d) => <String, dynamic>{...d.data(), 'id': d.id}).toList());
  Future<String> saveCategory(Map<String, dynamic> data, {String? id}) async {
    final payload = {...data, 'updatedAt': FieldValue.serverTimestamp()};
    if (id != null && id.isNotEmpty) { await firestore.collection('categories').doc(id).set({...payload, 'createdAt': FieldValue.serverTimestamp()}, SetOptions(merge: true)); return id; }
    final ref = await firestore.collection('categories').add({...payload, 'createdAt': FieldValue.serverTimestamp()}); return ref.id;
  }

  // ━━━ CART (owner-only; doc id = "{userId}_{productId}") ━━━
  String cartDocId(String userId, String productId) => '${userId}_$productId';
  Stream<List<Map<String, dynamic>>> streamMyCart(String userId) => firestore.collection('cart').where('userId', isEqualTo: userId).snapshots()
      .map((s) => s.docs.map((d) => <String, dynamic>{...d.data(), 'id': d.id}).toList());
  Future<void> setCartItem({required String userId, required String productId, required Map<String, dynamic> product, required int qty}) async {
    final ref = firestore.collection('cart').doc(cartDocId(userId, productId));
    if (qty <= 0) { await ref.delete().catchError((_) {}); return; }
    await ref.set({'userId': userId, 'productId': productId, 'qty': qty, 'productName': product['name'], 'price': product['price'], 'imageUrl': product['imageUrl'] ?? product['image'], 'category': product['category'], 'updatedAt': FieldValue.serverTimestamp(), 'createdAt': FieldValue.serverTimestamp()}, SetOptions(merge: true));
  }
  Future<void> clearMyCart(String userId) async {
    final snap = await firestore.collection('cart').where('userId', isEqualTo: userId).get();
    for (final d in snap.docs) { await d.reference.delete(); }
  }

  // ━━━ FAVORITES (owner-only) ━━━
  String favoriteDocId(String userId, String productId) => '${userId}_$productId';
  Stream<List<Map<String, dynamic>>> streamMyFavorites(String userId) => firestore.collection('favorites').where('userId', isEqualTo: userId).snapshots()
      .map((s) => s.docs.map((d) => <String, dynamic>{...d.data(), 'id': d.id}).toList());
  Future<void> setFavorite({required String userId, required String productId, required Map<String, dynamic> product, required bool isFavorite}) async {
    final ref = firestore.collection('favorites').doc(favoriteDocId(userId, productId));
    if (!isFavorite) { await ref.delete().catchError((_) {}); return; }
    await ref.set({'userId': userId, 'productId': productId, 'productName': product['name'], 'price': product['price'], 'imageUrl': product['imageUrl'] ?? product['image'], 'category': product['category'], 'createdAt': FieldValue.serverTimestamp(), 'updatedAt': FieldValue.serverTimestamp()}, SetOptions(merge: true));
  }

  // ━━━ REVIEWS (customers submit own; admins view; real-time summaries for product ratings) ━━━
  Stream<List<Map<String, dynamic>>> streamReviews() => firestore.collection('reviews').snapshots()
      .map((s) => s.docs.map((d) => <String, dynamic>{...d.data(), 'id': d.id}).toList());
  Stream<List<Map<String, dynamic>>> streamProductReviews(String productId) => firestore.collection('reviews').where('productId', isEqualTo: productId).snapshots()
      .map((s) => s.docs.map((d) => <String, dynamic>{...d.data(), 'id': d.id}).toList());
  Future<void> submitReview({required String userId, required String userName, required String productId, required String productName, required int rating, required String comment}) async {
    final safeRating = rating < 1 ? 1 : (rating > 5 ? 5 : rating);
    await firestore.collection('reviews').add({'userId': userId, 'userName': userName, 'userEmail': auth.currentUser?.email ?? '', 'productId': productId, 'productName': productName, 'rating': safeRating, 'comment': comment.trim(), 'createdAt': FieldValue.serverTimestamp(), 'updatedAt': FieldValue.serverTimestamp()});
  }

  // ━━━ NOTIFICATIONS (owner reads own; created by app/admin flows) ━━━
  Stream<List<Map<String, dynamic>>> streamMyNotifications(String userId) => firestore.collection('notifications').where('userId', isEqualTo: userId).snapshots()
      .map((s) => s.docs.map((d) => <String, dynamic>{...d.data(), 'id': d.id}).toList());
  Future<void> createNotification({required String userId, required String title, required String message, String type = 'system', String orderId = ''}) async {
    await firestore.collection('notifications').add({'userId': userId, 'title': title, 'message': message, 'type': type, 'orderId': orderId, 'read': false, 'createdAt': FieldValue.serverTimestamp(), 'updatedAt': FieldValue.serverTimestamp()});
  }
  Future<void> markNotificationRead(String id) async => firestore.collection('notifications').doc(id).update({'read': true, 'updatedAt': FieldValue.serverTimestamp()});

  // ━━━ PROMOTIONS (signed-in read; admin manages) ━━━
  Stream<List<Map<String, dynamic>>> streamPromotions() => firestore.collection('promotions').orderBy('updatedAt', descending: true).snapshots()
      .map((s) => s.docs.map((d) => <String, dynamic>{...d.data(), 'id': d.id}).toList());

  // ━━━ PAYMENTS (records only; NEVER store card numbers/CVV) ━━━
  Future<String> createPaymentRecord({required String userId, required String orderId, required String customer, required num amount, required String method, required String status, required String reference, required String proofUrl}) async {
    final payload = {'userId': userId, 'orderId': orderId, 'customer': customer, 'amount': amount, 'method': method, 'status': status, 'reference': reference, 'proofUrl': proofUrl, 'createdAt': FieldValue.serverTimestamp(), 'updatedAt': FieldValue.serverTimestamp()};
    final ref = await firestore.collection('payments').add(payload);
    return ref.id;
  }
  Stream<List<Map<String, dynamic>>> streamMyPayments(String userId) => firestore.collection('payments').where('userId', isEqualTo: userId).snapshots()
      .map((s) => s.docs.map((d) => <String, dynamic>{...d.data(), 'id': d.id}).toList());
}
