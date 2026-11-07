import 'dart:async';

import 'dart:convert';

import 'dart:io';



import 'package:cloud_firestore/cloud_firestore.dart';

import 'package:firebase_auth/firebase_auth.dart';

import 'package:firebase_core/firebase_core.dart';

import 'package:firebase_storage/firebase_storage.dart';

import 'package:flutter/material.dart';

import 'package:flutter/services.dart';

import 'package:image_picker/image_picker.dart';

import 'package:shared_preferences/shared_preferences.dart';



import 'firebase_options.dart';

import 'services/firebase_service.dart';

import 'chatbot_screen.dart';



const Color kPrimaryColor = Color(0xFF4F46E5);
const Color kPrimaryDark = Color(0xFF4338CA);
const Color kAccentColor = Color(0xFF06B6D4);
const Color kSurfaceLight = Color(0xFFF6F7FB);
const Color kSurfaceDark = Color(0xFF0B1220);
const Color kCardLight = Colors.white;
const Color kCardDark = Color(0xFF111C2E);
const Color kTextLight = Color(0xFF0F172A);
const Color kTextDark = Color(0xFFF8FAFC);
const Color kMutedLight = Color(0xFF64748B);
const Color kMutedDark = Color(0xFF94A3B8);

class _BasicQr extends StatelessWidget {
  const _BasicQr({required this.data, this.size = 100, this.dark = Colors.black});
  final String data;
  final double size;
  final Color dark;

  @override
  Widget build(BuildContext context) {
    const n = 21;
    final cells = List<bool>.filled(n * n, false);
    int hash = 2166136261;
    for (final c in data.codeUnits) {
      hash ^= c;
      hash = (hash * 16777619) & 0x7fffffff;
    }
    void finder(int ox, int oy) {
      for (var y = 0; y < 7; y++) {
        for (var x = 0; x < 7; x++) {
          final on = x == 0 || x == 6 || y == 0 || y == 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4);
          final px = ox + x, py = oy + y;
          if (px >= 0 && px < n && py >= 0 && py < n) cells[py * n + px] = on;
        }
      }
    }
    finder(0, 0);
    finder(n - 7, 0);
    finder(0, n - 7);
    for (var i = 0; i < cells.length; i++) {
      final y = i ~/ n, x = i % n;
      final inFinder = (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8);
      if (inFinder) continue;
      hash ^= i + data.length;
      hash = (hash * 1103515245 + 12345) & 0x7fffffff;
      cells[i] = (hash % 3) != 0;
    }
    final cell = size / n;
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(painter: _QrPainter(cells: cells, n: n, cell: cell, dark: dark)),
    );
  }
}

class _QrPainter extends CustomPainter {
  const _QrPainter({required this.cells, required this.n, required this.cell, required this.dark});
  final List<bool> cells;
  final int n;
  final double cell;
  final Color dark;
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = dark;
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        if (cells[y * n + x]) {
          canvas.drawRect(Rect.fromLTWH(x * cell, y * cell, cell, cell), paint);
        }
      }
    }
  }
  @override
  bool shouldRepaint(covariant _QrPainter old) => old.cells != cells || old.dark != dark;
}

class _RatingSummary {
  const _RatingSummary(this.average, this.count);
  final double average;
  final int count;
}
class ProductImage extends StatelessWidget {
  const ProductImage({
    super.key,
    required this.imageUrl,
    this.width = double.infinity,
    this.height = 150,
    this.fit = BoxFit.cover,
    this.borderRadius,
    this.placeholderColor,
  });

  final String imageUrl;
  final double width;
  final double height;
  final BoxFit fit;
  final BorderRadius? borderRadius;
  final Color? placeholderColor;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = placeholderColor ?? (isDark ? const Color(0xFF16233A) : const Color(0xFFEEF2FF));
    final iconColor = isDark ? const Color(0xFF64748B) : const Color(0xFF94A3B8);
    Widget placeholder(IconData icon, String label) => Container(
          width: width,
          height: height,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: isDark
                  ? [bg, const Color(0xFF0F172A)]
                  : [bg, const Color(0xFFE0E7FF)],
            ),
            borderRadius: borderRadius,
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: iconColor, size: 30),
              const SizedBox(height: 6),
              Text(label, style: TextStyle(color: iconColor, fontSize: 11, fontWeight: FontWeight.w600)),
            ],
          ),
        );
    final raw = imageUrl.trim();
    if (raw.isEmpty) return placeholder(Icons.image_outlined, 'No image');
    if (raw.startsWith('data:')) {
      try {
        final parts = raw.split(',');
        if (parts.length == 2) {
          final bytes = base64Decode(parts[1]);
          return ClipRRect(
            borderRadius: borderRadius ?? BorderRadius.zero,
            child: Image.memory(
              bytes,
              width: width,
              height: height,
              fit: fit,
              errorBuilder: (context, error, stackTrace) {
                print('[ProductImage] base64 render failed: $error');
                return placeholder(Icons.broken_image_outlined, 'Image unavailable');
              },
            ),
          );
        }
      } catch (e) {
        print('[ProductImage] base64 decode failed: $e');
      }
      return placeholder(Icons.broken_image_outlined, 'Image unavailable');
    }
    return ClipRRect(
      borderRadius: borderRadius ?? BorderRadius.zero,
      child: Image.network(
        raw,
        width: width,
        height: height,
        fit: fit,
        loadingBuilder: (context, child, loadingProgress) {
          if (loadingProgress == null) return child;
          return Container(
            width: width,
            height: height,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: isDark ? [bg, const Color(0xFF0F172A)] : [bg, const Color(0xFFE0E7FF)],
              ),
            ),
            alignment: Alignment.center,
            child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.2, color: kPrimaryColor.withAlpha(180))),
          );
        },
        errorBuilder: (context, error, stackTrace) {
          print('[ProductImage] network image failed for "$raw": $error');
          return placeholder(Icons.broken_image_outlined, 'Image unavailable');
        },
      ),
    );
  }
}

class Product {
  const Product({
    required this.name,
    required this.category,
    required this.price,
    required this.rating,
    required this.imageUrl,
    required this.tag,
    this.description = '',
    this.stock = 0,
    this.warranty = '',
    this.sku = '',
    this.id = '',
  });

  final String name;
  final String category;
  final double price;
  final double rating;
  final String imageUrl;
  final String tag;
  final String description;
  final int stock;
  final String warranty;
  final String sku;
  final String id;

  factory Product.fromJson(Map<String, dynamic> json, {String? id}) {
    // Tolerant mapping for admin/mobile schema variations; preserves actual stored values.
    String pickString(List<String> keys, [String fallback = '']) {
      for (final k in keys) {
        final v = json[k];
        if (v == null) continue;
        final s = v.toString().trim();
        if (s.isNotEmpty) return s;
      }
      return fallback;
    }

    num pickNum(List<String> keys, [num fallback = 0]) {
      for (final k in keys) {
        final v = json[k];
        if (v == null) continue;
        if (v is num) return v;
        final n = num.tryParse(v.toString().replaceAll(',', ''));
        if (n != null) return n;
      }
      return fallback;
    }

    final name = pickString(['name', 'Name', 'productName', 'title'], 'Unnamed Product');
    final imageUrl = pickString([
      'imageUrl', 'imageURL', 'image_url', 'photoUrl', 'photoURL', 'thumbnailUrl', 'thumbnail', 'image', 'img'
    ]);
    final price = pickNum(['price', 'sellingPrice', 'salePrice', 'unitPrice', 'amount'], 0).toDouble();
    final stock = pickNum(['stock', 'quantity', 'qty', 'inventory', 'availableStock'], 0).toInt();
    final description = pickString(['description', 'desc', 'details', 'specs'], '');
    final category = pickString(['category', 'Category', 'type'], 'General');
    final rating = pickNum(['rating', 'stars'], 0).toDouble();
    final tag = pickString(['tag', 'label', 'badge'], 'New');
    final warranty = pickString(['warranty', 'warrantyPeriod'], '');
    final sku = pickString(['sku', 'SKU', 'code', 'productCode'], id ?? '');

    if (imageUrl.isEmpty) {
      print('[Product.fromJson] product "${id ?? json['id'] ?? name}" has no image URL field. Keys: ${json.keys.toList()}');
    }

    return Product(
      id: id ?? pickString(['id', 'docId', 'productId'], ''),
      name: name,
      category: category,
      price: price,
      rating: rating,
      imageUrl: imageUrl,
      tag: tag,
      description: description,
      stock: stock < 0 ? 0 : stock,
      warranty: warranty,
      sku: sku,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'category': category,
      'price': price,
      'rating': rating,
      'imageUrl': imageUrl,
      'tag': tag,
      'description': description,
      'stock': stock,
      'warranty': warranty,
      'sku': sku,
    };
  }
}

class CustomerLocation {
  const CustomerLocation({
    this.fullName = '',
    this.phone = '',
    this.street = '',
    this.city = '',
    this.state = '',
    this.zipCode = '',
    this.country = 'Philippines',
  });

  final String fullName;
  final String phone;
  final String street;
  final String city;
  final String state;
  final String zipCode;
  final String country;

  factory CustomerLocation.empty() => const CustomerLocation();

  factory CustomerLocation.fromJson(Map<String, dynamic> json) {
    return CustomerLocation(
      fullName: json['fullName'] as String? ?? '',
      phone: json['phone'] as String? ?? '',
      street: json['street'] as String? ?? '',
      city: json['city'] as String? ?? '',
      state: json['state'] as String? ?? '',
      zipCode: json['zipCode'] as String? ?? '',
      country: json['country'] as String? ?? 'Philippines',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'fullName': fullName,
      'phone': phone,
      'street': street,
      'city': city,
      'state': state,
      'zipCode': zipCode,
      'country': country,
    };
  }

  String get formattedAddress {
    final parts = [street, city, state, zipCode, country].where((value) => value.trim().isNotEmpty).toList();
    return parts.join(', ');
  }
}

String _friendlyAuthMessage(String rawBody) {
  try {
    final decoded = jsonDecode(rawBody);
    if (decoded is Map && decoded['error'] is Map) {
      final message = decoded['error']['message'];
      if (message is String) {
        return message.replaceAll('_', ' ').replaceAll(RegExp(r'\s+'), ' ').trim();
      }
    }
  } catch (_) {}
  return 'Firebase auth is unavailable right now.';
}

Future<UserCredential> signInWithPassword(String email, String password) async {
  return await FirebaseService.instance.signIn(email: email, password: password);
}

Future<UserCredential> signUpWithPassword(String email, String password, {String fullName = ''}) async {
  return await FirebaseService.instance.signUp(email: email, password: password, fullName: fullName);
}

Future<void> signInGuest() async {
  try {
    final cred = await FirebaseService.instance.auth.signInAnonymously();
    await FirebaseService.instance.firestore.collection('users').doc(cred.user!.uid).set({
      'uid': cred.user!.uid,
      'email': 'guest@demo.local',
      'fullName': 'Guest User',
      'role': 'customer',
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  } catch (_) {
    // Anonymous auth may not be enabled; fall through
  }
}

final FirebaseStorage _storage = FirebaseStorage.instance;

Future<String?> uploadPaymentProofImage(File imageFile, String orderId) async {
  try {
    final ref = _storage.ref().child('payment_proofs/$orderId/${DateTime.now().millisecondsSinceEpoch}.jpg');
    await ref.putFile(imageFile);
    final downloadUrl = await ref.getDownloadURL();
    return downloadUrl;
  } catch (e) {
    return null;
  }
}

Future<void> saveLocationProfile(String userId, CustomerLocation profile) async {
  final loc = profile.toJson();
  final payload = <String, dynamic>{
    'userId': userId,
    'uid': userId,
    ...loc,
    'updatedAt': FieldValue.serverTimestamp(),
  };
  Object? primaryError;
  // Primary: customer_locations/{userId}
  try {
    await FirebaseService.instance.firestore
        .collection('customer_locations')
        .doc(userId)
        .set({...payload, 'createdAt': FieldValue.serverTimestamp()}, SetOptions(merge: true));
  } catch (e) {
    primaryError = e;
    print('[location] customer_locations save failed: $e');
  }
  // Mirror to users/{uid}.location (owner can update own profile fields without changing role/uid)
  try {
    await FirebaseService.instance.firestore.collection('users').doc(userId).set({
      'location': loc,
      'fullName': profile.fullName,
      'phone': profile.phone,
      'uid': userId,
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  } catch (e) {
    print('[location] users.location mirror failed: $e');
    if (primaryError != null) rethrow; // both failed
  }
  if (primaryError != null) {
    print('[location] saved via users.location fallback (customer_locations needs published firestore.rules)');
  }
}

Future<CustomerLocation> loadLocationProfile(String userId) async {
  // Try users/{uid}.location first (often allowed by existing/published rules), then customer_locations.
  try {
    final userDoc = await FirebaseService.instance.firestore.collection('users').doc(userId).get();
    final data = userDoc.data();
    final loc = data?['location'];
    if (loc is Map) {
      final parsed = CustomerLocation.fromJson(Map<String, dynamic>.from(loc));
      if (parsed.fullName.isNotEmpty || parsed.phone.isNotEmpty || parsed.street.isNotEmpty || parsed.city.isNotEmpty) return parsed;
    }
  } catch (e) {
    print('[location] users.location read failed: $e');
  }
  try {
    final doc = await FirebaseService.instance.firestore.collection('customer_locations').doc(userId).get();
    if (doc.exists && doc.data() != null) {
      return CustomerLocation.fromJson(Map<String, dynamic>.from(doc.data()!));
    }
  } catch (e) {
    print('[location] customer_locations doc read failed: $e');
  }
  try {
    final snapshot = await FirebaseService.instance.firestore
        .collection('customer_locations')
        .where('userId', isEqualTo: userId)
        .limit(1)
        .get();
    if (snapshot.docs.isNotEmpty) {
      return CustomerLocation.fromJson(Map<String, dynamic>.from(snapshot.docs.first.data()));
    }
  } catch (e) {
    print('[location] customer_locations query failed: $e');
  }
  return CustomerLocation.empty();
}

Future<void> _writeUserProfile(String userId, String email, {String? fullName}) async {
  try {
    final doc = FirebaseService.instance.firestore.collection('users').doc(userId);
    final snap = await doc.get();
    final payload = <String, dynamic>{
      'uid': userId,
      'email': email,
      'fullName': (fullName != null && fullName.trim().isNotEmpty) ? fullName.trim() : (email.isNotEmpty ? email.split('@').first : 'User'),
      'updatedAt': FieldValue.serverTimestamp(),
    };
    if (!snap.exists) {
      payload['role'] = 'customer'; // never self-assigned admin
      payload['createdAt'] = FieldValue.serverTimestamp();
    }
    await doc.set(payload, SetOptions(merge: true));
  } catch (e) {
    print('[app] _writeUserProfile skipped (publish corrected firestore.rules): $e');
  }
}

Future<String> saveCheckoutOrder({
  required String userId,
  required String userEmail,
  required Map<String, int> cartCounts,
  required List<Product> products,
  required CustomerLocation location,
  required String paymentMethod,
  required String paymentReference,
  required String paymentProofUrl,
  required String paymentNote,
}) async {
  if (cartCounts.isEmpty) throw Exception('Your cart is empty.');

  final lines = <Map<String, dynamic>>[];
  double total = 0;
  for (final entry in cartCounts.entries) {
    final qty = entry.value;
    if (qty <= 0) throw Exception('Invalid quantity for ${entry.key}.');
    final product = products.firstWhere(
      (item) => item.name == entry.key,
      orElse: () => const Product(name: '', category: '', price: 0, rating: 0, imageUrl: '', tag: ''),
    );
    if (product.name.isEmpty) throw Exception('A cart item is no longer available.');
    if (product.stock < qty) throw Exception('Insufficient stock for ${product.name}. Available: ${product.stock}.');
    final unitPrice = product.price;
    final lineTotal = unitPrice * qty;
    total += lineTotal;
    lines.add({
      'productId': product.id,
      'name': product.name,
      'qty': qty,
      'quantity': qty,
      'unitPrice': unitPrice,
      'price': unitPrice,
      'lineTotal': lineTotal,
      'imageUrl': product.imageUrl,
    });
  }
  if (lines.isEmpty) throw Exception('Your cart is empty.');
  total = lines.fold<double>(0, (sum, i) => sum + ((i['lineTotal'] as num?)?.toDouble() ?? 0));
  if (total <= 0) throw Exception('Order total is invalid.');

  final isCashOnDelivery = paymentMethod == 'Cash on Delivery';
  final orderId = 'ORD-${DateTime.now().millisecondsSinceEpoch}';
  final orderRef = FirebaseService.instance.firestore.collection('orders').doc(orderId);

  final refs = <DocumentReference<Map<String, dynamic>>>[];
  for (final item in lines) {
    final productId = (item['productId'] ?? '').toString();
    DocumentReference<Map<String, dynamic>>? ref;
    if (productId.isNotEmpty) {
      ref = FirebaseService.instance.firestore.collection('product').doc(productId);
    } else {
      final query = await FirebaseService.instance.firestore
          .collection('product')
          .where('name', isEqualTo: item['name'])
          .limit(1)
          .get();
      if (query.docs.isNotEmpty) ref = query.docs.first.reference;
    }
    if (ref == null) {
      throw Exception('Product "${item['name']}" could not be found. Please refresh and try again.');
    }
    refs.add(ref);
  }

  await FirebaseService.instance.firestore.runTransaction((tx) async {
    final snaps = <DocumentSnapshot<Map<String, dynamic>>>[];
    for (final ref in refs) {
      snaps.add(await tx.get(ref));
    }
    final updates = <DocumentReference<Map<String, dynamic>>, Map<String, dynamic>>{};
    for (var i = 0; i < snaps.length; i++) {
      final snap = snaps[i];
      final item = lines[i];
      if (!snap.exists) throw Exception('Product "${item['name']}" is no longer available.');
      final data = snap.data() ?? <String, dynamic>{};
      final qty = (item['qty'] as num).toInt();
      final currentStock = (data['stock'] as num?)?.toInt() ?? (data['quantity'] as num?)?.toInt() ?? 0;
      if (qty <= 0) throw Exception('Invalid quantity for ${item['name']}.');
      if (currentStock < qty) throw Exception('Insufficient stock for ${item['name']}. Available: $currentStock.');
      final nextStock = currentStock - qty;
      if (nextStock < 0) throw Exception('Stock cannot be negative for ${item['name']}.');
      final patch = <String, dynamic>{'stock': nextStock, 'updatedAt': FieldValue.serverTimestamp()};
      if (data.containsKey('quantity')) patch['quantity'] = nextStock;
      updates[refs[i]] = patch;
    }

    final orderData = <String, dynamic>{
      'id': orderId,
      'orderId': orderId,
      'customer': location.fullName.isNotEmpty ? location.fullName : userEmail,
      'customerEmail': userEmail,
      'customerId': userId,
      'items': lines,
      'products': lines.map((item) => item['name']).toList(),
      'address': location.toJson(),
      'delivery': location.toJson(),
      'paymentMethod': paymentMethod,
      'paymentReference': paymentReference,
      'paymentProofUrl': paymentProofUrl,
      'paymentNote': paymentNote,
      'paymentStatus': isCashOnDelivery ? 'Pending' : 'Pending Verification',
      'orderStatus': 'Pending',
      'total': total,
      'createdAt': FieldValue.serverTimestamp(),
      'date': DateTime.now().toIso8601String().split('T').first,
      'updatedAt': FieldValue.serverTimestamp(),
    };
    tx.set(orderRef, orderData);
    updates.forEach((ref, patch) => tx.update(ref, patch));
  });

  return orderId;
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  runApp(const MyApp());
}

class MyApp extends StatefulWidget {
  const MyApp({super.key});

  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> {
  bool _loading = false;
  String? _error;
  bool _isLogin = true;
  ThemeMode _themeMode = ThemeMode.light;
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  late final Stream<User?> _authStream;

  @override
  void initState() {
    super.initState();
    _authStream = FirebaseService.instance.authStateChanges;
    _restoreTheme();
  }

  Future<void> _restoreTheme() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _themeMode = prefs.getBool('dark_mode') == true ? ThemeMode.dark : ThemeMode.light;
    });
  }

  Future<void> _persistTheme(ThemeMode mode) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('dark_mode', mode == ThemeMode.dark);
  }

  Future<void> _authenticate({required bool guestMode}) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      if (guestMode) {
        await signInGuest();
      } else {
        final email = _emailController.text.trim();
        final password = _passwordController.text.trim();
        final fullName = _nameController.text.trim();
        if (email.isEmpty || password.isEmpty) {
          throw Exception('Email and password are required.');
        }
        if (!_isLogin && fullName.isEmpty) {
          throw Exception('Full name is required for registration.');
        }
        if (!_isLogin) {
          await signUpWithPassword(email, password, fullName: fullName);
        } else {
          await signInWithPassword(email, password);
        }
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(_friendlyAuthMessage(e.toString()))));
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = _themeMode == ThemeMode.dark;
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Seb Tech Mobile',
      themeMode: _themeMode,
      theme: ThemeData(
        brightness: Brightness.light,
        scaffoldBackgroundColor: kSurfaceLight,
        colorScheme: ColorScheme.fromSeed(seedColor: kPrimaryColor, brightness: Brightness.light),
        fontFamily: 'Inter',
        useMaterial3: true,
      ),
      darkTheme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: kSurfaceDark,
        colorScheme: ColorScheme.fromSeed(seedColor: kPrimaryColor, brightness: Brightness.dark),
        fontFamily: 'Inter',
        useMaterial3: true,
      ),
      home: StreamBuilder<User?>(
        stream: _authStream,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Scaffold(body: Center(child: CircularProgressIndicator()));
          }
          final user = snapshot.data;
          if (user == null) {
            return LoginScreen(
              loading: _loading,
              error: _error,
              isLogin: _isLogin,
              nameController: _nameController,
              emailController: _emailController,
              passwordController: _passwordController,
              onToggleMode: () => setState(() => _isLogin = !_isLogin),
              onLogin: () => _authenticate(guestMode: false),
              onGuestLogin: () => _authenticate(guestMode: true),
            );
          }
          return MobileHomePage(
            user: user,
            themeMode: _themeMode,
            isDark: isDark,
            onThemeChanged: (mode) async {
              await _persistTheme(mode);
              setState(() => _themeMode = mode);
            },
          );
        },
      ),
    );
  }
}

class GradientButton extends StatefulWidget {
  const GradientButton({
    super.key,
    required this.child,
    required this.onPressed,
    this.width = double.infinity,
    this.height = 56,
    this.borderRadius = 18,
    this.colors = const [kPrimaryColor, kPrimaryDark],
    this.isDisabled = false,
    this.isLoading = false,
    this.hapticFeedback = true,
  });

  final Widget child;
  final VoidCallback? onPressed;
  final double width;
  final double height;
  final double borderRadius;
  final List<Color> colors;
  final bool isDisabled;
  final bool isLoading;
  final bool hapticFeedback;

  @override
  State<GradientButton> createState() => _GradientButtonState();
}

class _GradientButtonState extends State<GradientButton> with SingleTickerProviderStateMixin {
  bool _isPressed = false;
  late AnimationController _scaleController;

  @override
  void initState() {
    super.initState();
    _scaleController = AnimationController(duration: const Duration(milliseconds: 100), vsync: this);
  }

  @override
  void dispose() {
    _scaleController.dispose();
    super.dispose();
  }

  void _onTapDown(TapDownDetails details) {
    if (widget.isDisabled || widget.isLoading || widget.onPressed == null) return;
    setState(() => _isPressed = true);
    _scaleController.forward();
    if (widget.hapticFeedback) HapticFeedback.lightImpact();
  }

  void _onTapUp(TapUpDetails details) {
    if (widget.isDisabled || widget.isLoading || widget.onPressed == null) return;
    setState(() => _isPressed = false);
    _scaleController.reverse();
  }

  void _onTapCancel() {
    if (widget.isDisabled || widget.isLoading || widget.onPressed == null) return;
    setState(() => _isPressed = false);
    _scaleController.reverse();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: _onTapDown,
      onTapUp: _onTapUp,
      onTapCancel: _onTapCancel,
      onTap: widget.onPressed,
      child: AnimatedBuilder(
        animation: _scaleController,
        builder: (context, child) {
          final scale = 1.0 - (_scaleController.value * 0.04);
          return Transform.scale(
            scale: scale,
            child: Container(
              width: widget.width,
              height: widget.height,
              decoration: BoxDecoration(
                gradient: widget.isDisabled ? null : LinearGradient(colors: widget.colors, begin: Alignment.topLeft, end: Alignment.bottomRight),
                color: widget.isDisabled ? kMutedLight : null,
                borderRadius: BorderRadius.circular(widget.borderRadius),
                boxShadow: widget.isDisabled || widget.isLoading
                    ? null
                    : [BoxShadow(color: widget.colors.first.withAlpha(90), blurRadius: 14, offset: const Offset(0, 7))],
              ),
              child: Center(
                child: widget.isLoading
                    ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                    : DefaultTextStyle(
                        style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700, letterSpacing: 0.4),
                        child: widget.child,
                      ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class OutlineGradientButton extends StatefulWidget {
  const OutlineGradientButton({
    super.key,
    required this.child,
    required this.onPressed,
    this.width = double.infinity,
    this.height = 56,
    this.borderRadius = 18,
    this.borderColor = kPrimaryColor,
    this.gradientColors = const [kPrimaryColor, kPrimaryDark],
    this.isDisabled = false,
    this.hapticFeedback = true,
  });

  final Widget child;
  final VoidCallback? onPressed;
  final double width;
  final double height;
  final double borderRadius;
  final Color borderColor;
  final List<Color> gradientColors;
  final bool isDisabled;
  final bool hapticFeedback;

  @override
  State<OutlineGradientButton> createState() => _OutlineGradientButtonState();
}

class _OutlineGradientButtonState extends State<OutlineGradientButton> with SingleTickerProviderStateMixin {
  bool _isPressed = false;
  late AnimationController _scaleController;

  @override
  void initState() {
    super.initState();
    _scaleController = AnimationController(duration: const Duration(milliseconds: 100), vsync: this);
  }

  @override
  void dispose() {
    _scaleController.dispose();
    super.dispose();
  }

  void _onTapDown(TapDownDetails details) {
    if (widget.isDisabled || widget.onPressed == null) return;
    setState(() => _isPressed = true);
    _scaleController.forward();
    if (widget.hapticFeedback) HapticFeedback.lightImpact();
  }

  void _onTapUp(TapUpDetails details) {
    if (widget.isDisabled || widget.onPressed == null) return;
    setState(() => _isPressed = false);
    _scaleController.reverse();
  }

  void _onTapCancel() {
    if (widget.isDisabled || widget.onPressed == null) return;
    setState(() => _isPressed = false);
    _scaleController.reverse();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: _onTapDown,
      onTapUp: _onTapUp,
      onTapCancel: _onTapCancel,
      onTap: widget.onPressed,
      child: AnimatedBuilder(
        animation: _scaleController,
        builder: (context, child) {
          final scale = 1.0 - (_scaleController.value * 0.04);
          return Transform.scale(
            scale: scale,
            child: Container(
              width: widget.width,
              height: widget.height,
              decoration: BoxDecoration(
                gradient: widget.isDisabled ? null : LinearGradient(colors: widget.gradientColors, begin: Alignment.topLeft, end: Alignment.bottomRight),
                color: widget.isDisabled ? kSurfaceDark : null,
                borderRadius: BorderRadius.circular(widget.borderRadius),
                border: Border.all(color: widget.isDisabled ? kMutedLight : widget.borderColor, width: 2),
                boxShadow: widget.isDisabled ? null : [BoxShadow(color: widget.gradientColors.first.withAlpha(70), blurRadius: 12, offset: const Offset(0, 5))],
              ),
              child: Center(
                child: DefaultTextStyle(style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w700), child: widget.child),
              ),
            ),
          );
        },
      ),
    );
  }
}

class LoginScreen extends StatelessWidget {
  const LoginScreen({
    required this.loading,
    required this.error,
    required this.isLogin,
    required this.nameController,
    required this.emailController,
    required this.passwordController,
    required this.onToggleMode,
    required this.onLogin,
    required this.onGuestLogin,
    super.key,
  });

  final bool loading;
  final String? error;
  final bool isLogin;
  final TextEditingController nameController;
  final TextEditingController emailController;
  final TextEditingController passwordController;
  final VoidCallback onToggleMode;
  final Future<void> Function() onLogin;
  final Future<void> Function() onGuestLogin;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kSurfaceDark,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Container(
              constraints: const BoxConstraints(maxWidth: 440),
              padding: const EdgeInsets.all(32),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(28),
                color: kCardDark,
                border: Border.all(color: const Color(0xFF334155)),
                boxShadow: const [BoxShadow(color: Color(0x80000000), blurRadius: 32, offset: Offset(0, 20))],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Expanded(
                        child: Text('Seb Tech', style: TextStyle(color: Colors.white, fontSize: 34, fontWeight: FontWeight.w900, letterSpacing: -0.5)),
                      ),
                      Container(
                        padding: const EdgeInsets.all(4),
                        decoration: BoxDecoration(color: kPrimaryColor.withAlpha(20), borderRadius: BorderRadius.circular(14)),
                        child: Row(
                          children: [
                            _ModeButton(label: 'Login', selected: isLogin, onTap: onToggleMode),
                            _ModeButton(label: 'Sign up', selected: !isLogin, onTap: onToggleMode),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(isLogin ? 'Sign in to continue shopping.' : 'Create an account to start shopping.',
                      style: const TextStyle(color: kMutedDark, fontSize: 14)),
                  const SizedBox(height: 24),
                  if (!isLogin) ...[
                    _buildInputLabel('Full Name'),
                    const SizedBox(height: 8),
                    _buildTextField(nameController, 'Your full name', Icons.person_outline, false),
                    const SizedBox(height: 16),
                  ],
                  _buildInputLabel('Email Address'),

                  const SizedBox(height: 8),
                  _buildTextField(emailController, 'name@example.com', Icons.email_outlined, false),
                  const SizedBox(height: 16),
                  _buildInputLabel('Password'),
                  const SizedBox(height: 8),
                  _buildTextField(passwordController, '••••••••••', Icons.lock_outlined, true),
                  if (error != null) ...[
          const SizedBox(height: 16),
          OutlineGradientButton(
            onPressed: () async {
              await FirebaseService.instance.signOut();
            },
            borderColor: Colors.redAccent,
            gradientColors: const [Color(0xFF7F1D1D), Color(0xFF991B1B)],
            child: const Text('Logout'),
          ),
          const SizedBox(height: 20),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(color: const Color(0xFF7F1D1D).withAlpha(30), borderRadius: BorderRadius.circular(14)),
                      child: Text(error!, style: const TextStyle(color: Color(0xFFE2E8F0), fontSize: 13)),
                    ),
                  ],
                  const SizedBox(height: 24),
                  GradientButton(onPressed: loading ? null : () { onLogin(); }, isDisabled: loading, isLoading: loading, child: Text(isLogin ? 'Sign In' : 'Create Account')),
                  const SizedBox(height: 16),
                  OutlineGradientButton(
                    onPressed: loading ? null : () { onGuestLogin(); },
                    isDisabled: loading,
                    borderColor: kPrimaryColor,
                    gradientColors: const [kSurfaceDark, kCardDark],
                    child: const Text('Continue as Guest'),
                  ),
                  const SizedBox(height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text('No account? ', style: const TextStyle(color: kMutedDark, fontSize: 13)),
                      GestureDetector(
                        onTap: onToggleMode,
                        child: Text(isLogin ? 'Sign up' : 'Sign in', style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildInputLabel(String label) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(label, style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700)),
    );
  }

  Widget _buildTextField(TextEditingController controller, String hint, IconData icon, bool obscure) {
    return TextField(
      controller: controller,
      obscureText: obscure,
      keyboardType: obscure ? TextInputType.visiblePassword : TextInputType.emailAddress,
      style: const TextStyle(color: Colors.white),
      decoration: InputDecoration(
        filled: true,
        fillColor: const Color(0xFF0F172A),
        prefixIcon: Icon(icon, color: kMutedDark, size: 20),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: const Color(0xFF334155), width: 1)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: kPrimaryColor, width: 2)),
        contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
        hintText: hint,
        hintStyle: const TextStyle(color: Color(0xFF94A3B8)),
      ),
    );
  }
}

class _ModeButton extends StatefulWidget {
  const _ModeButton({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  State<_ModeButton> createState() => _ModeButtonState();
}

class _ModeButtonState extends State<_ModeButton> with SingleTickerProviderStateMixin {
  bool _isPressed = false;
  late AnimationController _scaleController;

  @override
  void initState() {
    super.initState();
    _scaleController = AnimationController(duration: const Duration(milliseconds: 100), vsync: this);
  }

  @override
  void dispose() {
    _scaleController.dispose();
    super.dispose();
  }

  void _onTapDown(TapDownDetails details) {
    setState(() => _isPressed = true);
    _scaleController.forward();
    HapticFeedback.lightImpact();
  }

  void _onTapUp(TapUpDetails details) {
    setState(() => _isPressed = false);
    _scaleController.reverse();
  }

  void _onTapCancel() {
    setState(() => _isPressed = false);
    _scaleController.reverse();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: _onTapDown,
      onTapUp: _onTapUp,
      onTapCancel: _onTapCancel,
      onTap: widget.onTap,
      child: AnimatedBuilder(
        animation: _scaleController,
        builder: (context, child) {
          final scale = 1.0 - (_scaleController.value * 0.04);
          return Transform.scale(
            scale: scale,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
              decoration: BoxDecoration(
                color: widget.selected ? kPrimaryColor : _isPressed ? const Color(0xFF334155) : Colors.transparent,
                borderRadius: BorderRadius.circular(999),
                border: widget.selected ? null : Border.all(color: const Color(0xFF334155), width: 1),
                boxShadow: widget.selected ? [BoxShadow(color: kPrimaryColor.withAlpha(80), blurRadius: 10, offset: const Offset(0, 5))] : null,
              ),
              child: Text(widget.label, style: TextStyle(color: widget.selected ? Colors.white : kMutedDark, fontSize: 12, fontWeight: FontWeight.w700)),
            ),
          );
        },
      ),
    );
  }
}

class MobileHomePage extends StatefulWidget {
  const MobileHomePage({
    required this.user,
    required this.themeMode,
    required this.isDark,
    required this.onThemeChanged,
    super.key,
  });

  final User user;
  final ThemeMode themeMode;
  final bool isDark;
  final ValueChanged<ThemeMode> onThemeChanged;

  @override
  State<MobileHomePage> createState() => _MobileHomePageState();
}

class _MobileHomePageState extends State<MobileHomePage> {
  final List<String> categories = const ['All', 'Laptops', 'Monitors', 'Storage', 'Peripherals', 'Headphones', 'Tablets'];
  final TextEditingController _searchController = TextEditingController();
  final Map<String, int> _cartCounts = <String, int>{};
  Set<String> _favoriteIds = <String>{};
  final Map<String, TextEditingController> _addressControllers = {
    'fullName': TextEditingController(),
    'phone': TextEditingController(),
    'street': TextEditingController(),
    'city': TextEditingController(),
    'state': TextEditingController(),
    'zipCode': TextEditingController(),
    'country': TextEditingController(text: 'Philippines'),
  };
  List<Product> _products = [];
  String _selectedCategory = 'All';
  int _selectedNavIndex = 0;
  bool _loadingProducts = true;
  bool _loadingOrders = true;
  bool _savingLocation = false;
  final TextEditingController _paymentReferenceController = TextEditingController();
  File? _paymentProofFile;
  String? _paymentProofUrl;
  final TextEditingController _paymentNoteController = TextEditingController();
  String _selectedPaymentMethod = 'Cash on Delivery';
  bool _isCheckingOut = false;
  String? _productError;
  List<Map<String, dynamic>> _myOrders = [];
  StreamSubscription<List<Map<String, dynamic>>>? _productSub;
  StreamSubscription<List<Map<String, dynamic>>>? _orderSub;
  StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? _userSub;
  StreamSubscription<List<Map<String, dynamic>>>? _cartSub;
  StreamSubscription<List<Map<String, dynamic>>>? _favSub;
  StreamSubscription<List<Map<String, dynamic>>>? _notifSub;
  StreamSubscription<List<Map<String, dynamic>>>? _catSub;
  StreamSubscription<List<Map<String, dynamic>>>? _promoSub;
  List<Map<String,dynamic>> _myNotifications=[];
  List<Map<String,dynamic>> _promotions=[];
  String _userRole = 'customer';
  Map<String, _RatingSummary> _ratingByProduct = {}; // key: product doc id or name

  _RatingSummary _ratingFor(Product p) {
    final byId = p.id.isNotEmpty ? _ratingByProduct[p.id] : null;
    if (byId != null) return byId;
    final byName = _ratingByProduct[p.name];
    if (byName != null) return byName;
    if (p.rating > 0) return _RatingSummary(p.rating, 0);
    return const _RatingSummary(0, 0);
  }
  StreamSubscription<List<Map<String, dynamic>>>? _reviewSub;

  @override
  void initState() {
    super.initState();
    _subscribeToFirestore();
  }

  void _subscribeToFirestore() {
    final fb = FirebaseService.instance;
    print('[HomeShell][products] project=${fb.firestore.app.options.projectId} uid=${widget.user.uid} collection=product');

    _productSub = fb.streamProducts().listen((rows) {
      if (!mounted) return;
      print('[HomeShell][products] received ${rows.length} doc(s) from Firestore collection "product"');
      setState(() {
        _products = rows.map((item) {
          try {
            return Product.fromJson(item, id: item['id']?.toString());
          } catch (e, st) {
            print('[HomeShell][products] parse error doc=${item['id']}: $e');
            print(st);
            return null;
          }
        }).whereType<Product>().toList();
        _loadingProducts = false;
        _productError = null;
      });
      if (rows.isEmpty) {
        print('[HomeShell][products] no products visible. Verify: Firestore rules PUBLISHED for collection "product" (singular), signed-in/allowed user, admin saved to "product", and same project (${fb.firestore.app.options.projectId}).');
      }
    }, onError: (e, st) {
      print('[HomeShell][products] stream error: $e');
      print(st);
      if (!mounted) return;
      final msg = e.toString();
      setState(() {
        _loadingProducts = false;
        _productError = msg;
      });
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg.contains('permission-denied') || msg.contains('PERMISSION_DENIED')
            ? 'Unable to load products right now. Please try again.'
            : 'Unable to load products. Please try again.'),
        backgroundColor: Colors.red,
      ));
    });

    _orderSub = fb.streamMyOrders(widget.user.uid).listen((rows) {
      if (!mounted) return;
      print('[HomeShell][orders] received ${rows.length} order(s) for ${widget.user.uid}');
      setState(() {
        _myOrders = rows;
        _loadingOrders = false;
      });
    }, onError: (e, st) {
      print('[HomeShell][orders] stream error for ${widget.user.uid}: $e');
      print(st);
      if (!mounted) return;
      setState(() => _loadingOrders = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(e.toString().contains('permission-denied') || e.toString().contains('PERMISSION_DENIED')
            ? 'Unable to load your orders right now. Please try again.'
            : 'Unable to load your orders. Please try again.'),
        backgroundColor: Colors.red,
      ));
    });

    _userSub = FirebaseService.instance.firestore.collection('users').doc(widget.user.uid).snapshots().listen((doc) {
      if (!mounted) return;
      final data = doc.data() ?? <String, dynamic>{};
      final location = data['location'];
      setState(() {
        _userRole = (data['role'] ?? 'customer').toString();
        _addressControllers['fullName']!.text = (data['fullName'] ?? widget.user.displayName ?? widget.user.email ?? '').toString();
        _addressControllers['phone']!.text = (data['phone'] ?? '').toString();
        if (location is Map) {
          _addressControllers['street']!.text = (location['street'] ?? '').toString();
          _addressControllers['city']!.text = (location['city'] ?? '').toString();
          _addressControllers['state']!.text = (location['state'] ?? '').toString();
          _addressControllers['zipCode']!.text = (location['zipCode'] ?? '').toString();
          _addressControllers['country']!.text = (location['country'] ?? 'Philippines').toString();
        }
      });
    });

    // Load delivery address from customer_locations/{uid} (primary) with fallback handling.
    loadLocationProfile(widget.user.uid).then((loc) {
      if (!mounted) return;
      if (loc.fullName.isNotEmpty || loc.phone.isNotEmpty || loc.street.isNotEmpty || loc.city.isNotEmpty) {
        setState(() {
          if (_addressControllers['fullName']!.text.trim().isEmpty) _addressControllers['fullName']!.text = loc.fullName;
          if (_addressControllers['phone']!.text.trim().isEmpty) _addressControllers['phone']!.text = loc.phone;
          if (_addressControllers['street']!.text.trim().isEmpty) _addressControllers['street']!.text = loc.street;
          if (_addressControllers['city']!.text.trim().isEmpty) _addressControllers['city']!.text = loc.city;
          if (_addressControllers['state']!.text.trim().isEmpty) _addressControllers['state']!.text = loc.state;
          if (_addressControllers['zipCode']!.text.trim().isEmpty) _addressControllers['zipCode']!.text = loc.zipCode;
          if (_addressControllers['country']!.text.trim().isEmpty) _addressControllers['country']!.text = loc.country;
        });
      }
    });

    _reviewSub = FirebaseService.instance.streamReviews().listen((rows) {
      if (!mounted) return;
      final map = <String, List<double>>{};
      for (final r in rows) {
        final rating = (r['rating'] as num?)?.toDouble();
        if (rating == null || rating <= 0) continue;
        for (final key in [(r['productId'] ?? '').toString(), (r['productName'] ?? '').toString()]) {
          final k = key.trim();
          if (k.isEmpty) continue;
          (map[k] ??= <double>[]).add(rating.clamp(1, 5).toDouble());
        }
      }
      final summary = <String, _RatingSummary>{};
      map.forEach((k, vals) {
        if (vals.isEmpty) return;
        summary[k] = _RatingSummary(vals.reduce((a, b) => a + b) / vals.length, vals.length);
      });
      setState(() => _ratingByProduct = summary);
    }, onError: (e, st) { print('[HomeShell][reviews] stream error: $e'); print(st); });
  }

  @override
  void dispose() {
    _productSub?.cancel();
    _orderSub?.cancel();
    _userSub?.cancel();
    _cartSub?.cancel();
    _favSub?.cancel();
    _notifSub?.cancel();
    _catSub?.cancel();
    _promoSub?.cancel();
    _reviewSub?.cancel();
    _searchController.dispose();
    _paymentReferenceController.dispose();
    _paymentNoteController.dispose();
    for (final controller in _addressControllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _refreshProducts() async {
    setState(() { _loadingProducts = true; _productError = null; });
    try {
      final fb = FirebaseService.instance;
      print('[HomeShell][products] manual refresh project=${fb.firestore.app.options.projectId} uid=${fb.auth.currentUser?.uid} collection=product');
      final products = await fb.fetchProducts();
      if (!mounted) return;
      setState(() {
        _products = products.map((item) {
          try { return Product.fromJson(item, id: item['id']?.toString()); } catch (e, st) { print('[HomeShell][products] refresh parse error: $e'); print(st); return null; }
        }).whereType<Product>().toList();
        _loadingProducts = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(_products.isEmpty
            ? 'No products available right now.'
            : 'Products updated (${_products.length}).'),
        backgroundColor: _products.isEmpty ? Colors.orange : kPrimaryColor,
      ));
    } catch (e, st) {
      print('[HomeShell][products] refresh error: $e');
      print(st);
      if (!mounted) return;
      setState(() { _loadingProducts = false; _productError = e.toString(); });
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to load products: $e'), backgroundColor: Colors.red));
    }
  }

  CustomerLocation _readLocationFromFields() {
    return CustomerLocation(
      fullName: _addressControllers['fullName']!.text.trim(),
      phone: _addressControllers['phone']!.text.trim(),
      street: _addressControllers['street']!.text.trim(),
      city: _addressControllers['city']!.text.trim(),
      state: _addressControllers['state']!.text.trim(),
      zipCode: _addressControllers['zipCode']!.text.trim(),
      country: _addressControllers['country']!.text.trim().isNotEmpty ? _addressControllers['country']!.text.trim() : 'Philippines',
    );
  }

  Future<void> _saveLocation() async {
    final profile = _readLocationFromFields();
    if (profile.fullName.isEmpty || profile.phone.isEmpty || profile.street.isEmpty || profile.city.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please complete full name, phone, street, and city.'), backgroundColor: Colors.red));
      return;
    }
    setState(() => _savingLocation = true);
    try {
      print('[location] saving delivery address uid=${widget.user.uid}');
      await saveLocationProfile(widget.user.uid, profile);
      try {
        await _writeUserProfile(widget.user.uid, widget.user.email ?? '', fullName: profile.fullName);
      } catch (e) {
        print('[location] user profile mirror failed (non-fatal): $e');
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Delivery details saved. You can proceed to checkout.'), backgroundColor: kPrimaryColor),
      );
    } catch (e, st) {
      print('[location] save failed: $e');
      print(st);
      if (!mounted) return;
      final msg = e.toString();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(msg.contains('permission-denied') || msg.contains('PERMISSION_DENIED')
            ? 'Unable to save delivery address right now. Please try again.'
            : 'Failed to save delivery details. Please try again.'),
        backgroundColor: Colors.red,
      ));
    } finally {
      if (mounted) setState(() => _savingLocation = false);
    }
  }

  List<Product> get _filteredProducts {
    final query = _searchController.text.trim().toLowerCase();
    return _products.where((product) {
      final matchesCategory = _selectedCategory == 'All' || product.category.toLowerCase() == _selectedCategory.toLowerCase();
      final matchesSearch = query.isEmpty ||
          product.name.toLowerCase().contains(query) ||
          product.category.toLowerCase().contains(query) ||
          product.tag.toLowerCase().contains(query);
      return matchesCategory && matchesSearch;
    }).toList();
  }

  int get _cartItemCount => _cartCounts.values.fold<int>(0, (sum, count) => sum + count);

  double get _cartTotal {
    double total = 0;
    for (final entry in _cartCounts.entries) {
      final product = _products.firstWhere(
        (item) => item.name == entry.key,
        orElse: () => const Product(name: '', category: '', price: 0, rating: 0, imageUrl: '', tag: ''),
      );
      total += product.price * entry.value;
    }
    return total;
  }

  void _addToCart(Product product) {
    if (product.stock <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('This product is out of stock.')));
      return;
    }
    final current = _cartCounts[product.name] ?? 0;
    if (current >= product.stock) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Only ${product.stock} item(s) available for ${product.name}.')));
      return;
    }
    setState(() => _cartCounts[product.name] = current + 1);
  }

  void _removeFromCart(Product product) {
    final current = _cartCounts[product.name] ?? 0;
    if (current <= 0) return;
    setState(() {
      if (current == 1) {
        _cartCounts.remove(product.name);
      } else {
        _cartCounts[product.name] = current - 1;
      }
    });
  }

  Future<void> _checkout() async {
    if (_isCheckingOut) return;
    setState(() => _isCheckingOut = true);
    try {
      final cartProducts = _products.where((product) => (_cartCounts[product.name] ?? 0) > 0).toList();
      if (cartProducts.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Your cart is empty.')));
        return;
      }
      final location = _readLocationFromFields();
      if (location.fullName.isEmpty || location.phone.isEmpty || location.street.isEmpty || location.city.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please enter full name, phone, street, and city in Profile/Delivery Address, then try again.'), backgroundColor: Colors.orange));
        setState(() => _selectedNavIndex = 4);
        return;
      }
      final paymentMethod = _selectedPaymentMethod;
      final paymentReference = _paymentReferenceController.text.trim();
      final paymentNote = _paymentNoteController.text.trim();
      if (paymentMethod != 'Cash on Delivery' && paymentReference.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please enter payment reference or transfer code.')));
        return;
      }

      // Re-validate stock before submission
      for (final product in cartProducts) {
        final qty = _cartCounts[product.name] ?? 0;
        if (qty <= 0) throw Exception('Invalid cart quantity.');
        if (product.stock < qty) {
          throw Exception('Insufficient stock for ${product.name}. Available: ${product.stock}.');
        }
      }

      // Best-effort save of delivery address before checkout (does not block order if address rules differ)
      try {
        await saveLocationProfile(widget.user.uid, location);
      } catch (e) {
        print('[checkout] delivery address save (best-effort) failed: $e');
      }

      String? proofUrl = _paymentProofUrl;
      if (_paymentProofFile != null) {
        final orderId = 'ORD-${DateTime.now().millisecondsSinceEpoch}';
        final uploadedUrl = await uploadPaymentProofImage(_paymentProofFile!, orderId);
        if (uploadedUrl != null) {
          proofUrl = uploadedUrl;
        } else {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Failed to upload payment proof image.'), backgroundColor: Colors.red));
          return;
        }
      }

      final orderId = await saveCheckoutOrder(
        userId: widget.user.uid,
        userEmail: widget.user.email ?? 'unknown@customer.local',
        cartCounts: Map<String, int>.from(_cartCounts),
        products: _products,
        location: location,
        paymentMethod: paymentMethod,
        paymentReference: paymentReference,
        paymentProofUrl: proofUrl ?? '',
        paymentNote: paymentNote,
      );
      try { await FirebaseService.instance.createPaymentRecord(userId: widget.user.uid, orderId: orderId, customer: location.fullName.isNotEmpty ? location.fullName : (widget.user.email ?? 'Customer'), amount: cartProducts.fold<double>(0,(s,p)=>s + p.price * (_cartCounts[p.name]??0)), method: paymentMethod, status: paymentMethod == 'Cash on Delivery' ? 'Pending' : 'Pending Verification', reference: paymentReference, proofUrl: proofUrl ?? ''); } catch (e) { print('[payments] record failed: $e'); }
      try { await FirebaseService.instance.createNotification(userId: widget.user.uid, title: 'Order placed', message: 'Your order was submitted and is pending processing.', type: 'order', orderId: orderId); } catch (e) { print('[notifications] create failed: $e'); }
      try { await FirebaseService.instance.clearMyCart(widget.user.uid); } catch (e) { print('[cart] clear failed: $e'); }
      if (!mounted) return;
      setState(() {
        _cartCounts.clear();
        _paymentReferenceController.clear();
        _paymentProofFile = null;
        _paymentProofUrl = null;
        _paymentNoteController.clear();
        _selectedPaymentMethod = 'Cash on Delivery';
        _selectedNavIndex = 4;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Order $orderId saved. Admin can now process it.'), backgroundColor: kPrimaryColor),
      );
    } catch (e, st) {
      print('[checkout] failed: $e');
      print(st);
      if (!mounted) return;
      final msg = e.toString();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(msg.contains('permission-denied') || msg.contains('PERMISSION_DENIED')
            ? 'Unable to complete checkout. Please save your delivery details and try again.'
            : _friendlyAuthMessage(msg)),
        backgroundColor: Colors.red,
      ));
    } finally {
      if (mounted) setState(() => _isCheckingOut = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = widget.isDark;
    final surfaceColor = isDark ? kSurfaceDark : kSurfaceLight;
    final cardColor = isDark ? kCardDark : kCardLight;
    final textColor = isDark ? kTextDark : kTextLight;
    final mutedColor = isDark ? kMutedDark : kMutedLight;

    final screens = <Widget>[
      KeyedSubtree(key: const ValueKey('home'), child: _buildHomeScreen(cardColor, textColor, mutedColor, isDark)),
      KeyedSubtree(key: const ValueKey('saved'), child: _buildSavedScreen(cardColor, textColor, mutedColor)),
      KeyedSubtree(key: const ValueKey('assistant'), child: ChatbotScreen(userId: widget.user.uid)),
      KeyedSubtree(key: const ValueKey('cart'), child: _buildCartScreen(cardColor, textColor, mutedColor)),
      KeyedSubtree(key: const ValueKey('profile'), child: _buildProfileScreen(cardColor, textColor, mutedColor)),
    ];

    return Scaffold(
      backgroundColor: surfaceColor,
      body: SafeArea(
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 300),
          transitionBuilder: (Widget child, Animation<double> animation) {
            return FadeTransition(opacity: animation, child: child);
          },
          child: screens[_selectedNavIndex],
        ),
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(color: cardColor, boxShadow: [BoxShadow(color: isDark ? const Color(0x80000000) : const Color(0x14000000), blurRadius: 12, offset: const Offset(0, -6))]),
        child: BottomNavigationBar(
          currentIndex: _selectedNavIndex,
          onTap: (value) => setState(() => _selectedNavIndex = value),
          backgroundColor: cardColor,
          type: BottomNavigationBarType.fixed,
          selectedItemColor: kPrimaryColor,
          unselectedItemColor: mutedColor,
          showUnselectedLabels: false,
          elevation: 0,
          items: const [
            BottomNavigationBarItem(icon: Icon(Icons.home_outlined), activeIcon: Icon(Icons.home), label: 'Home'),
            BottomNavigationBarItem(icon: Icon(Icons.favorite_border), activeIcon: Icon(Icons.favorite), label: 'Saved'),
            BottomNavigationBarItem(icon: Icon(Icons.smart_toy_outlined), activeIcon: Icon(Icons.smart_toy), label: 'Assistant'),
            BottomNavigationBarItem(icon: Icon(Icons.shopping_cart_outlined), activeIcon: Icon(Icons.shopping_cart), label: 'Cart'),
            BottomNavigationBarItem(icon: Icon(Icons.person_outline), activeIcon: Icon(Icons.person), label: 'Profile'),
          ],
        ),
      ),
    );
  }

  Widget _iconAction({required IconData icon, String? badge, required Color cardColor, required Color border, required Color textColor, required VoidCallback onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(color: cardColor, borderRadius: BorderRadius.circular(14), border: Border.all(color: border)),
        child: Stack(clipBehavior: Clip.none, alignment: Alignment.center, children: [
          Icon(icon, color: textColor, size: 21),
          if (badge != null)
            Positioned(
              right: -4,
              top: -4,
              child: Container(
                constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
                padding: const EdgeInsets.symmetric(horizontal: 4),
                decoration: BoxDecoration(color: kPrimaryColor, borderRadius: BorderRadius.circular(999), border: Border.all(color: cardColor, width: 1.5)),
                alignment: Alignment.center,
                child: Text(badge, style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w900)),
              ),
            ),
        ]),
      ),
    );
  }

  Widget _buildHomeScreen(Color cardColor, Color textColor, Color mutedColor, bool isDark) {
    final products = _filteredProducts;
    final border = isDark ? const Color(0xFF243247) : const Color(0xFFE5EAF3);
    return RefreshIndicator(
      onRefresh: _refreshProducts,
      color: kPrimaryColor,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 8),
            child: Row(
              children: [
                Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [kPrimaryColor, kAccentColor], begin: Alignment.topLeft, end: Alignment.bottomRight),
                    borderRadius: BorderRadius.circular(15),
                    boxShadow: [BoxShadow(color: kPrimaryColor.withAlpha(55), blurRadius: 14, offset: const Offset(0, 6))],
                  ),
                  child: const Icon(Icons.storefront_rounded, color: Colors.white, size: 23),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Seb Tech', style: TextStyle(fontSize: 11, color: mutedColor, fontWeight: FontWeight.w700, letterSpacing: 0.4)),
                      const SizedBox(height: 2),
                      Text('Discover tech you’ll love', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: textColor, height: 1.1)),
                    ],
                  ),
                ),
                _iconAction(
                  icon: Icons.shopping_bag_outlined,
                  badge: _cartItemCount > 0 ? '$_cartItemCount' : null,
                  cardColor: cardColor,
                  border: border,
                  textColor: textColor,
                  onTap: () => setState(() => _selectedNavIndex = 3),
                ),
                const SizedBox(width: 10),
                _iconAction(
                  icon: Icons.refresh_rounded,
                  cardColor: cardColor,
                  border: border,
                  textColor: textColor,
                  onTap: () async {
                    await _refreshProducts();
                    if (!mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: const Text('Products updated.'), backgroundColor: kPrimaryColor, behavior: SnackBarBehavior.floating, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                    );
                  },
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Container(
              height: 52,
              decoration: BoxDecoration(color: cardColor, borderRadius: BorderRadius.circular(16), border: Border.all(color: border)),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                child: Row(children: [
                  Icon(Icons.search_rounded, color: mutedColor, size: 21),
                  const SizedBox(width: 10),
                  Expanded(child: TextField(controller: _searchController, onChanged: (_) => setState(() {}), decoration: InputDecoration(border: InputBorder.none, hintText: 'Search products, brands, categories', hintStyle: TextStyle(color: mutedColor, fontSize: 14)), style: TextStyle(color: textColor, fontSize: 14))),
                ]),
              ),
            ),
          ),
          const SizedBox(height: 14),
          SizedBox(
            height: 42,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              scrollDirection: Axis.horizontal,
              itemCount: categories.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, index) {
                final selected = categories[index] == _selectedCategory;
                return GestureDetector(
                  onTap: () => setState(() => _selectedCategory = categories[index]),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
                    decoration: BoxDecoration(
                      color: selected ? kPrimaryColor : cardColor,
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: selected ? kPrimaryColor : border),
                    ),
                    child: Text(categories[index], style: TextStyle(color: selected ? Colors.white : textColor, fontWeight: FontWeight.w700, fontSize: 12.5)),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 16),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Container(
              height: 156,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(22),
                gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF312E81), kPrimaryColor, Color(0xFF0891B2)]),
                boxShadow: [BoxShadow(color: kPrimaryColor.withAlpha(60), blurRadius: 20, offset: const Offset(0, 10))],
              ),
              child: Stack(children: [
                Positioned(right: -18, top: -18, child: Container(width: 120, height: 120, decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withAlpha(18)))),
                Positioned(right: 36, bottom: -28, child: Container(width: 96, height: 96, decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withAlpha(14)))),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 18, 14, 18),
                  child: Row(children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                            decoration: BoxDecoration(color: Colors.white.withAlpha(28), borderRadius: BorderRadius.circular(999)),
                            child: const Text('SEB TECH PICKS', style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 1.1)),
                          ),
                          const SizedBox(height: 10),
                          const Text('Smart tech,\nbetter deals', style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900, height: 1.05)),
                          const SizedBox(height: 8),
                          Text('Curated gadgets & accessories', style: TextStyle(color: Colors.white.withAlpha(210), fontSize: 12.5, fontWeight: FontWeight.w500)),
                        ],
                      ),
                    ),
                    Container(
                      width: 96,
                      height: 116,
                      decoration: BoxDecoration(borderRadius: BorderRadius.circular(18), border: Border.all(color: Colors.white.withAlpha(35))),
                      clipBehavior: Clip.antiAlias,
                      child: ProductImage(imageUrl: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=900&q=80', width: 96, height: 116, fit: BoxFit.cover, borderRadius: BorderRadius.circular(18)),
                    ),
                  ]),
                ),
              ]),
            ),
          ),
          const SizedBox(height: 18),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Text('Featured Products', style: TextStyle(color: textColor, fontSize: 19, fontWeight: FontWeight.w800, letterSpacing: -0.2)),
              GestureDetector(
                onTap: () => setState(() => _selectedNavIndex = 3),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(color: kPrimaryColor.withAlpha(isDark ? 35 : 20), borderRadius: BorderRadius.circular(999)),
                  child: Row(children: const [Text('Cart', style: TextStyle(color: kPrimaryColor, fontSize: 12.5, fontWeight: FontWeight.w800)), SizedBox(width: 2), Icon(Icons.chevron_right_rounded, color: kPrimaryColor, size: 17)]),
                ),
              ),
            ]),
          ),
          const SizedBox(height: 10),
          Expanded(
            child: _loadingProducts
                ? const Center(child: CircularProgressIndicator(color: kPrimaryColor))
                : _productError != null
                    ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                        const Icon(Icons.cloud_off_rounded, size: 56, color: Colors.redAccent),
                        const SizedBox(height: 12),
                        Text('Cannot load products', style: TextStyle(color: textColor, fontSize: 18, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 8),
                        Text(_productError!.contains('permission-denied') || _productError!.contains('PERMISSION_DENIED')
                            ? 'Unable to load products right now.'
                            : 'Unable to load products right now.', textAlign: TextAlign.center, style: TextStyle(color: mutedColor, fontSize: 13)),
                        const SizedBox(height: 14),
                        ElevatedButton.icon(onPressed: _refreshProducts, icon: const Icon(Icons.refresh), label: const Text('Retry')),
                      ])))
                : products.isEmpty
                    ? Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                        Icon(Icons.inventory_2_outlined, size: 64, color: kMutedDark),
                        const SizedBox(height: 16),
                        Text('No products found', style: TextStyle(color: textColor, fontSize: 18, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 8),
                        Text('Products added by the store will appear here.', textAlign: TextAlign.center, style: TextStyle(color: mutedColor, fontSize: 13)),
                        const SizedBox(height: 14),
                        TextButton.icon(onPressed: _refreshProducts, icon: const Icon(Icons.refresh), label: const Text('Refresh')),
                      ]))
                    : GridView.builder(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        itemCount: products.length,
                        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, childAspectRatio: 0.72, crossAxisSpacing: 14, mainAxisSpacing: 16),
                        itemBuilder: (context, index) {
                          final product = products[index];
                          final isFavorite = _favoriteIds.contains(product.name);
                          final cartQty = _cartCounts[product.name] ?? 0;
                          return _buildProductCard(product, isFavorite, cartQty, cardColor, textColor, mutedColor);
                        },
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildProductCard(Product product, bool isFavorite, int cartQty, Color cardColor, Color textColor, Color mutedColor) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final border = isDark ? const Color(0xFF243247) : const Color(0xFFE8EDF5);
    final rating = _ratingFor(product);
    final ratingText = rating.count > 0 ? '${rating.average.toStringAsFixed(1)} (${rating.count})' : (product.rating > 0 ? product.rating.toStringAsFixed(1) : 'New');
    return GestureDetector(
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => ProductDetailScreen(
              product: product,
              ratingSummary: _ratingFor(product),
              user: widget.user,
              isFavorite: isFavorite,
              onFavoriteChanged: (fav) {
                final updatedFavs = Set<String>.from(_favoriteIds);
                if (fav) {
                  updatedFavs.add(product.name);
                } else {
                  updatedFavs.remove(product.name);
                }
                setState(() => _favoriteIds = updatedFavs);
              },
              onAddToCart: () => setState(() => _cartCounts[product.name] = (cartQty + 1)),
            ),
          ),
        );
      },
      child: Container(
        decoration: BoxDecoration(
          color: cardColor,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: border),
          boxShadow: [BoxShadow(color: isDark ? const Color(0x33000000) : const Color(0x120F172A), blurRadius: 16, offset: const Offset(0, 8))],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Stack(children: [
            ClipRRect(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
              child: ProductImage(imageUrl: product.imageUrl, height: 148, width: double.infinity, fit: BoxFit.cover),
            ),
            Positioned(
              top: 10,
              left: 10,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                decoration: BoxDecoration(color: Colors.white.withAlpha(isDark ? 28 : 235), borderRadius: BorderRadius.circular(999), border: Border.all(color: Colors.white.withAlpha(isDark ? 30 : 120))),
                child: Text(product.tag.isEmpty ? 'Featured' : product.tag, style: TextStyle(color: isDark ? Colors.white : kPrimaryDark, fontSize: 9.5, fontWeight: FontWeight.w800)),
              ),
            ),
            Positioned(
              top: 8,
              right: 8,
              child: GestureDetector(
                onTap: () async {
                  final isFav = !_favoriteIds.contains(product.name);
                  setState(() => isFav ? _favoriteIds.add(product.name) : _favoriteIds.remove(product.name));
                  try {
                    await FirebaseService.instance.setFavorite(userId: widget.user.uid, productId: product.id.isNotEmpty ? product.id : product.name, product: product.toJson(), isFavorite: isFav);
                  } catch (e) {
                    print('[favorites] failed: $e');
                  }
                },
                child: Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(color: cardColor.withAlpha(235), borderRadius: BorderRadius.circular(12), border: Border.all(color: border)),
                  child: Icon(isFavorite ? Icons.favorite_rounded : Icons.favorite_border_rounded, color: isFavorite ? const Color(0xFFEF4444) : mutedColor, size: 17),
                ),
              ),
            ),
          ]),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 11, 12, 12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(product.category.toUpperCase(), style: TextStyle(fontSize: 10, color: mutedColor, fontWeight: FontWeight.w800, letterSpacing: 0.5)),
                const SizedBox(height: 4),
                Text(product.name, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: textColor, height: 1.15), maxLines: 2, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 7),
                Row(children: [
                  const Icon(Icons.star_rounded, color: Color(0xFFF59E0B), size: 15),
                  const SizedBox(width: 4),
                  Text(ratingText, style: TextStyle(fontSize: 11.5, color: rating.count > 0 ? textColor : mutedColor, fontWeight: FontWeight.w700)),
                ]),
                const Spacer(),
                Row(children: [
                  Expanded(child: Text('\$${product.price.toStringAsFixed(2)}', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: textColor, letterSpacing: -0.2))),
                  GestureDetector(
                    onTap: () => _addToCart(product),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 160),
                      height: 34,
                      padding: EdgeInsets.symmetric(horizontal: cartQty > 0 ? 10 : 0),
                      constraints: const BoxConstraints(minWidth: 34),
                      decoration: BoxDecoration(color: cartQty > 0 ? kPrimaryColor.withAlpha(isDark ? 45 : 22) : kPrimaryColor, borderRadius: BorderRadius.circular(11), border: cartQty > 0 ? Border.all(color: kPrimaryColor.withAlpha(70)) : null),
                      alignment: Alignment.center,
                      child: cartQty > 0
                          ? Text('Added $cartQty', style: const TextStyle(color: kPrimaryColor, fontSize: 11, fontWeight: FontWeight.w800))
                          : const Icon(Icons.add_rounded, color: Colors.white, size: 18),
                    ),
                  ),
                ]),
              ]),
            ),
          ),
        ]),
      ),
    );
  }

  Widget _buildSavedScreen(Color cardColor, Color textColor, Color mutedColor) {
    final savedProducts = _products.where((product) => _favoriteIds.contains(product.name)).toList();
    return Padding(padding: const EdgeInsets.all(20), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('Saved Items', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: textColor)),
      const SizedBox(height: 16),
      Expanded(child: savedProducts.isEmpty
          ? Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [Icon(Icons.favorite_border_rounded, size: 64, color: kMutedDark), const SizedBox(height: 16), Text('No saved products yet', style: TextStyle(color: textColor, fontSize: 18, fontWeight: FontWeight.w700)), const SizedBox(height: 8), Text('Tap the heart icon on any product to save it', style: TextStyle(color: mutedColor, fontSize: 14))]))
          : ListView.separated(
              itemCount: savedProducts.length,
              separatorBuilder: (_, __) => const SizedBox(height: 14),
              itemBuilder: (context, index) {
                final product = savedProducts[index];
                return Container(padding: const EdgeInsets.all(14), decoration: BoxDecoration(color: cardColor, borderRadius: BorderRadius.circular(18)), child: Row(children: [
                  ClipRRect(borderRadius: BorderRadius.circular(14), child: ProductImage(imageUrl: product.imageUrl, width: 72, height: 72, fit: BoxFit.cover, borderRadius: BorderRadius.circular(14))),
                  const SizedBox(width: 14),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(product.name, style: TextStyle(color: textColor, fontWeight: FontWeight.w800, fontSize: 15), maxLines: 2, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 4),
                    Text(product.category, style: TextStyle(color: mutedColor, fontSize: 12)),
                    const SizedBox(height: 6),
                    Text('\$${product.price.toStringAsFixed(2)}', style: TextStyle(color: textColor, fontSize: 16, fontWeight: FontWeight.w900)),
                  ])),
                  IconButton(onPressed: () => setState(() => _favoriteIds.remove(product.name)), icon: const Icon(Icons.delete_outline_rounded), color: Colors.redAccent),
                ]));
              },
            )),
    ]));
  }

  Widget _buildCartScreen(Color cardColor, Color textColor, Color mutedColor) {
    final cartProducts = _products.where((product) => (_cartCounts[product.name] ?? 0) > 0).toList();
    return Padding(padding: const EdgeInsets.all(20), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('My Cart', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: textColor)),
      const SizedBox(height: 16),
      Expanded(child: cartProducts.isEmpty
          ? Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [Icon(Icons.shopping_cart_outlined, size: 64, color: kMutedDark), const SizedBox(height: 16), Text('Your cart is empty', style: TextStyle(color: textColor, fontSize: 18, fontWeight: FontWeight.w700)), const SizedBox(height: 8), Text('Add products from the home screen', style: TextStyle(color: mutedColor, fontSize: 14))]))
          : ListView.separated(
              itemCount: cartProducts.length,
              separatorBuilder: (_, __) => const SizedBox(height: 14),
              itemBuilder: (context, index) {
                final product = cartProducts[index];
                final qty = _cartCounts[product.name] ?? 0;
                return Container(padding: const EdgeInsets.all(14), decoration: BoxDecoration(color: cardColor, borderRadius: BorderRadius.circular(18)), child: Row(children: [
                  ClipRRect(borderRadius: BorderRadius.circular(14), child: ProductImage(imageUrl: product.imageUrl, width: 72, height: 72, fit: BoxFit.cover, borderRadius: BorderRadius.circular(14))),
                  const SizedBox(width: 14),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(product.name, style: TextStyle(color: textColor, fontWeight: FontWeight.w800, fontSize: 15), maxLines: 2, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 4),
                    Text('\$${product.price.toStringAsFixed(2)}', style: TextStyle(color: mutedColor, fontSize: 14, fontWeight: FontWeight.w700)),
                  ])),
                  Row(children: [
                    IconButton(onPressed: () => _removeFromCart(product), icon: const Icon(Icons.remove_circle_outlined), color: kMutedDark),
                    Text('$qty', style: TextStyle(color: textColor, fontWeight: FontWeight.w900, fontSize: 16)),
                    IconButton(onPressed: () => _addToCart(product), icon: const Icon(Icons.add_circle_outlined), color: kPrimaryColor),
                  ]),
                ]));
              },
            )),
      Container(width: double.infinity, padding: const EdgeInsets.all(18), decoration: BoxDecoration(color: cardColor, borderRadius: BorderRadius.circular(22), boxShadow: [BoxShadow(color: const Color(0x14000000), blurRadius: 12, offset: const Offset(0, -6))]), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text('Payment Method', style: TextStyle(color: textColor, fontWeight: FontWeight.w800, fontSize: 16)), Text('\$${_cartTotal.toStringAsFixed(2)}', style: TextStyle(color: textColor, fontSize: 18, fontWeight: FontWeight.w900))]),
        const SizedBox(height: 14),
        DropdownButtonFormField<String>(value: _selectedPaymentMethod, isExpanded: true, decoration: InputDecoration(filled: true, fillColor: widget.isDark ? const Color(0xFF334155) : const Color(0xFFF1F5F9), border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none), contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14)), items: const [DropdownMenuItem(value: 'GCash', child: Text('GCash')), DropdownMenuItem(value: 'Bank Transfer', child: Text('Bank Transfer')), DropdownMenuItem(value: 'Cash on Delivery', child: Text('Cash on Delivery'))], onChanged: (value) { if (value != null) setState(() => _selectedPaymentMethod = value); }),
        const SizedBox(height: 14),
        if (_selectedPaymentMethod != 'Cash on Delivery') ...[
          _paymentQrCard(textColor: textColor, mutedColor: mutedColor, isDark: widget.isDark),
          const SizedBox(height: 14),
          TextField(controller: _paymentReferenceController, style: TextStyle(color: textColor), decoration: InputDecoration(labelText: 'Payment Reference / Transaction Code', labelStyle: TextStyle(color: mutedColor), filled: true, fillColor: widget.isDark ? const Color(0xFF334155) : const Color(0xFFF1F5F9), border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none))),
          const SizedBox(height: 14),
          GestureDetector(
            onTap: () async {
              final picker = ImagePicker();
              final picked = await picker.pickImage(source: ImageSource.gallery, imageQuality: 70);
              if (picked != null) {
                setState(() {
                  _paymentProofFile = File(picked.path);
                  _paymentProofUrl = null;
                });
              }
            },
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: widget.isDark ? const Color(0xFF334155) : const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: _paymentProofFile != null ? kPrimaryColor : Colors.transparent, width: 2),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.upload_file_rounded, color: kPrimaryColor, size: 20),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          _paymentProofFile != null ? 'Image selected: ${_paymentProofFile!.path.split('/').last}' : 'Upload Payment Proof Image',
                          style: TextStyle(color: _paymentProofFile != null ? kPrimaryColor : mutedColor, fontSize: 14, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  ),
                  if (_paymentProofFile != null) ...[
                    const SizedBox(height: 10),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: Image.file(_paymentProofFile!, width: 100, height: 100, fit: BoxFit.cover),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
        if (_selectedPaymentMethod == 'Cash on Delivery') ...[
          TextField(controller: _paymentNoteController, maxLines: 2, style: TextStyle(color: textColor), decoration: InputDecoration(labelText: 'Delivery Instructions', labelStyle: TextStyle(color: mutedColor), filled: true, fillColor: widget.isDark ? const Color(0xFF334155) : const Color(0xFFF1F5F9), border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none))),
        ],
        const SizedBox(height: 16),
        GradientButton(onPressed: _isCheckingOut ? null : _checkout, isLoading: _isCheckingOut, child: Text(_isCheckingOut ? 'Processing...' : 'Place Order')),
      ])),
    ]));
  }

  Widget _paymentQrCard({required Color textColor, required Color mutedColor, required bool isDark}) {
    final isGcash = _selectedPaymentMethod == 'GCash';
    final accent = isGcash ? const Color(0xFF007DFE) : const Color(0xFF059669);
    final title = isGcash ? 'GCash QR' : 'Bank Transfer QR';
    final accountLabel = isGcash ? 'GCash Number' : 'Bank Account';
    final accountValue = isGcash ? '09XX XXX XXXX' : '0000 0000 0000';
    final name = 'Seb Tech';
    final payload = '$_selectedPaymentMethod|$name|$accountValue|amount=${_cartTotal.toStringAsFixed(2)}';
    final bg = isDark ? const Color(0xFF16233A) : const Color(0xFFF8FAFF);
    final border = isDark ? const Color(0xFF243247) : const Color(0xFFE5EAF3);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(16), border: Border.all(color: border)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0xFFE5E7EB))),
          child: _BasicQr(data: payload, size: 104, dark: const Color(0xFF111827)),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4), decoration: BoxDecoration(color: accent.withAlpha(28), borderRadius: BorderRadius.circular(999)), child: Text(title, style: TextStyle(color: accent, fontSize: 11, fontWeight: FontWeight.w800))),
            ]),
            const SizedBox(height: 8),
            Text('Scan to pay', style: TextStyle(color: textColor, fontSize: 14, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text('$accountLabel: $accountValue', style: TextStyle(color: mutedColor, fontSize: 12, fontWeight: FontWeight.w600)),
            Text('Account name: $name', style: TextStyle(color: mutedColor, fontSize: 12)),
            const SizedBox(height: 6),
            Text('Amount due: \$${_cartTotal.toStringAsFixed(2)}', style: TextStyle(color: textColor, fontSize: 12.5, fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            Text('After payment, enter the reference and upload proof below.', style: TextStyle(color: mutedColor, fontSize: 11, height: 1.35)),
          ]),
        ),
      ]),
    );
  }

  Widget _buildProfileScreen(Color cardColor, Color textColor, Color mutedColor) {
    final displayName = _addressControllers['fullName']!.text.trim().isNotEmpty
        ? _addressControllers['fullName']!.text.trim()
        : (widget.user.displayName ?? widget.user.email ?? 'Guest');
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Profile', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: textColor)),
              Switch(value: widget.isDark, onChanged: (value) => widget.onThemeChanged(value ? ThemeMode.dark : ThemeMode.light)),
            ],
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: cardColor, borderRadius: BorderRadius.circular(20)),
            child: Row(
              children: [
                Container(
                  width: 56, height: 56,
                  decoration: BoxDecoration(color: kPrimaryColor.withAlpha(30), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(Icons.person_rounded, color: kPrimaryColor, size: 28),
                ),
                const SizedBox(width: 14),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(displayName, style: TextStyle(color: textColor, fontWeight: FontWeight.w800, fontSize: 16)),
                        const SizedBox(height: 2),
                        Text(widget.user.email ?? 'Guest', style: TextStyle(color: mutedColor, fontSize: 13)),
                        const SizedBox(height: 2),
                        Text(widget.user.isAnonymous ? 'Guest Account' : 'Registered ${_userRole == 'admin' ? 'Admin' : 'Customer'}', style: TextStyle(color: kAccentColor, fontSize: 12, fontWeight: FontWeight.w700)),
                      ]),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),
          Text('Dark Mode', style: TextStyle(color: textColor, fontWeight: FontWeight.w800, fontSize: 20)),
          const SizedBox(height: 8),
          Text('Choose light or dark theme for the storefront', style: TextStyle(color: mutedColor, fontSize: 13)),
          const SizedBox(height: 18),
          Text('Delivery Address', style: TextStyle(color: textColor, fontWeight: FontWeight.w800, fontSize: 20)),
          const SizedBox(height: 12),
          _field('Full Name', _addressControllers['fullName']!, textColor),
          _field('Phone', _addressControllers['phone']!, textColor),
          _field('Street Address', _addressControllers['street']!, textColor),
          Row(
            children: [
              Expanded(child: _field('City', _addressControllers['city']!, textColor)),
              const SizedBox(width: 12),
              Expanded(child: _field('State', _addressControllers['state']!, textColor)),
            ],
          ),
          Row(
            children: [
              Expanded(child: _field('ZIP Code', _addressControllers['zipCode']!, textColor)),
              const SizedBox(width: 12),
              Expanded(child: _field('Country', _addressControllers['country']!, textColor)),
            ],
          ),
          const SizedBox(height: 20),
          GradientButton(onPressed: _savingLocation ? null : _saveLocation, isLoading: _savingLocation, child: const Text('Save Delivery Details')),
          const SizedBox(height: 20),
          Text('My Orders', style: TextStyle(color: textColor, fontWeight: FontWeight.w800, fontSize: 20)),
          const SizedBox(height: 12),
          if (_loadingOrders)
            const Padding(padding: EdgeInsets.symmetric(vertical: 24), child: Center(child: CircularProgressIndicator()))
          else if (_myOrders.isEmpty)
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(color: cardColor, borderRadius: BorderRadius.circular(16)),
              child: Center(
                child: Column(
                  children: [
                    Icon(Icons.receipt_long_outlined, size: 48, color: mutedColor),
                    const SizedBox(height: 12),
                    Text('No orders yet', style: TextStyle(color: textColor, fontSize: 16, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 4),
                    Text('Place an order to see it here', style: TextStyle(color: mutedColor, fontSize: 13)),
                  ],
                ),
              ),
            )
          else
            Column(
              children: _myOrders.map((order) {
                final status = order['orderStatus'] ?? 'Pending';
                final paymentStatus = order['paymentStatus'] ?? 'Pending Verification';
                final total = (order['total'] ?? 0).toStringAsFixed(2);
                final date = order['date'] ?? '';
                final isPaid = paymentStatus == 'Paid' || paymentStatus == 'Verified';
                return Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(color: cardColor, borderRadius: BorderRadius.circular(16)),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Order ${order['id'] ?? ''}', style: TextStyle(color: textColor, fontWeight: FontWeight.w800, fontSize: 14)),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: status == 'Delivered' || status == 'Cancelled' || paymentStatus == 'Paid'
                                  ? const Color(0xFF10B981).withAlpha(30)
                                  : status == 'Pending' || paymentStatus == 'Pending Verification'
                                      ? const Color(0xFFF59E0B).withAlpha(30)
                                      : const Color(0xFF4F46E5).withAlpha(30),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              '$status${isPaid ? ' • Paid' : ''}',
                              style: TextStyle(
                                color: status == 'Delivered' || status == 'Cancelled' || paymentStatus == 'Paid'
                                    ? const Color(0xFF10B981)
                                    : status == 'Pending' || paymentStatus == 'Pending Verification'
                                        ? const Color(0xFFF59E0B)
                                        : const Color(0xFF4F46E5),
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text('\$$total', style: TextStyle(color: kPrimaryColor, fontWeight: FontWeight.w800, fontSize: 16)),
                      const SizedBox(height: 4),
                      Text(date, style: TextStyle(color: mutedColor, fontSize: 11)),
                      if (paymentStatus == 'Pending Verification') ...[
                        const SizedBox(height: 8),
                        Text('Waiting for admin to verify your payment proof', style: TextStyle(color: mutedColor, fontSize: 12)),
                      ],
                    ],
                  ),
                );
              }).toList(),
            ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () async {
                await FirebaseService.instance.signOut();
              },
              icon: const Icon(Icons.logout_rounded, color: Color(0xFFEF4444)),
              label: const Text('Sign Out', style: TextStyle(color: Color(0xFFEF4444), fontWeight: FontWeight.w800)),
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                side: const BorderSide(color: Color(0xFFEF4444)),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
            ),
          ),
          const SizedBox(height: 12),
        ],
      ),
    );
  }

  Widget _field(String label, TextEditingController controller, Color textColor) {
    return Padding(padding: const EdgeInsets.only(bottom: 14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: textColor)),
      const SizedBox(height: 8),
      TextField(controller: controller, style: TextStyle(color: textColor), decoration: InputDecoration(filled: true, fillColor: widget.isDark ? const Color(0xFF334155) : const Color(0xFFF1F5F9), contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16), border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none))),
    ]));
  }
}

class ProductDetailScreen extends StatefulWidget {
  const ProductDetailScreen({
    required this.product,
    required this.ratingSummary,
    required this.user,
    required this.isFavorite,
    required this.onFavoriteChanged,
    required this.onAddToCart,
    super.key,
  });

  final Product product;
  final _RatingSummary ratingSummary;
  final User user;
  final bool isFavorite;
  final ValueChanged<bool> onFavoriteChanged;
  final VoidCallback onAddToCart;

  @override
  State<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends State<ProductDetailScreen> {
  bool _isFavorite = false;
  int _quantity = 1;
  bool _submittingRating = false;

  @override
  void initState() {
    super.initState();
    _isFavorite = widget.isFavorite;
  }

  String get _productKey => widget.product.id.isNotEmpty ? widget.product.id : widget.product.name;

  Future<void> _submitRating(int rating, String comment) async {
    if (widget.user.isAnonymous) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please sign in with a real account to submit a rating.'), backgroundColor: Colors.orange));
      return;
    }
    setState(() => _submittingRating = true);
    try {
      await FirebaseService.instance.submitReview(
        userId: widget.user.uid,
        userName: widget.user.displayName?.trim().isNotEmpty == true ? widget.user.displayName!.trim() : (widget.user.email ?? 'Customer'),
        productId: _productKey,
        productName: widget.product.name,
        rating: rating,
        comment: comment,
      );
      if (!mounted) return;
      Navigator.of(context).maybePop();
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Rating submitted.'), backgroundColor: kPrimaryColor));
    } catch (e) {
      print('[ProductDetail][rating] submit failed: $e');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Unable to submit rating right now. Please try again.'),
        backgroundColor: Colors.red,
      ));
    } finally {
      if (mounted) setState(() => _submittingRating = false);
    }
  }

  Future<void> _showRateDialog(Color cardColor, Color textColor, Color mutedColor) async {
    var selected = 5;
    final commentCtrl = TextEditingController();
    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(builder: (ctx, setD) => AlertDialog(
        backgroundColor: cardColor,
        title: Text('Rate this product', style: TextStyle(color: textColor, fontWeight: FontWeight.w800)),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(widget.product.name, style: TextStyle(color: mutedColor, fontSize: 13)),
          const SizedBox(height: 12),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: List.generate(5, (i) {
            final v = i + 1;
            return IconButton(onPressed: _submittingRating ? null : () => setD(() => selected = v), icon: Icon(v <= selected ? Icons.star_rounded : Icons.star_border_rounded, color: const Color(0xFFFBBF24), size: 30));
          })),
          TextField(controller: commentCtrl, maxLines: 3, style: TextStyle(color: textColor), decoration: InputDecoration(hintText: 'Optional comment', hintStyle: TextStyle(color: mutedColor), filled: true, fillColor: isDarkColor(cardColor) ? const Color(0xFF0F172A) : const Color(0xFFF8FAFC), border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)))),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(onPressed: _submittingRating ? null : () async { await _submitRating(selected, commentCtrl.text.trim()); }, child: _submittingRating ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Submit')),
        ],
      )),
    );
    commentCtrl.dispose();
  }

  bool isDarkColor(Color c) => c.computeLuminance() < 0.5;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final cardColor = isDark ? kCardDark : kCardLight;
    final textColor = isDark ? kTextDark : kTextLight;
    final mutedColor = isDark ? kMutedDark : kMutedLight;

    return Scaffold(
      backgroundColor: isDark ? kSurfaceDark : kSurfaceLight,
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: 320,
            floating: false,
            pinned: true,
            backgroundColor: isDark ? kSurfaceDark : Colors.white,
            foregroundColor: textColor,
            elevation: 0,
            flexibleSpace: FlexibleSpaceBar(
              background: ProductImage(imageUrl: widget.product.imageUrl, fit: BoxFit.cover),
            ),
            actions: [
              IconButton(icon: Icon(_isFavorite ? Icons.favorite_rounded : Icons.favorite_border_rounded, color: _isFavorite ? Colors.redAccent : kMutedDark), onPressed: () => setState(() => _isFavorite = !_isFavorite)),
              IconButton(icon: const Icon(Icons.share_rounded, color: kMutedDark), onPressed: () {}),
            ],
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6), decoration: BoxDecoration(color: kPrimaryColor.withAlpha(30), borderRadius: BorderRadius.circular(12)), child: Text(widget.product.tag, style: const TextStyle(color: kPrimaryColor, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 0.8))),
            const SizedBox(height: 12),
            Text(widget.product.name, style: TextStyle(color: textColor, fontSize: 28, fontWeight: FontWeight.w900, height: 1.2)),
            const SizedBox(height: 6),
            Text(widget.product.category, style: TextStyle(color: mutedColor, fontSize: 14, fontWeight: FontWeight.w600)),
            const SizedBox(height: 16),
            StreamBuilder<List<Map<String, dynamic>>>(
              stream: FirebaseService.instance.streamProductReviews(widget.product.id.isNotEmpty ? widget.product.id : widget.product.name),
              builder: (context, snap) {
                final reviews = snap.data ?? const <Map<String, dynamic>>[];
                final valid = reviews.where((r) => ((r['rating'] as num?)?.toDouble() ?? 0) > 0).toList();
                final avg = valid.isEmpty ? (widget.ratingSummary.count > 0 ? widget.ratingSummary.average : widget.product.rating) : valid.map((r) => (r['rating'] as num).toDouble()).reduce((a, b) => a + b) / valid.length;
                final count = valid.isEmpty ? widget.ratingSummary.count : valid.length;
                return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  InkWell(
                    onTap: () => _showRateDialog(cardColor, textColor, mutedColor),
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      decoration: BoxDecoration(color: cardColor, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFF334155))),
                      child: Row(children: [
                        Row(mainAxisSize: MainAxisSize.min, children: List.generate(5, (i) { final pos=i+1; final icon = avg>=pos?Icons.star_rounded:(avg>=pos-0.5?Icons.star_half_rounded:Icons.star_border_rounded); return Icon(icon, color: const Color(0xFFFBBF24), size: 18); })),
                        const SizedBox(width: 8),
                        Text(count > 0 ? '${avg.toStringAsFixed(1)} (${count})' : (avg > 0 ? avg.toStringAsFixed(1) : 'No ratings yet — tap to rate'), style: TextStyle(fontSize: 14, color: textColor, fontWeight: FontWeight.w800)),
                        const Spacer(),
                        const Icon(Icons.touch_app_rounded, color: kPrimaryColor, size: 18),
                      ]),
                    ),
                  ),
                  if (snap.hasError) Padding(padding: const EdgeInsets.only(top: 6), child: Text('Ratings unavailable: ${snap.error}', style: const TextStyle(color: Colors.orange, fontSize: 11))),
                ]);
              },
            ),
            const SizedBox(height: 12),
            Row(children: [Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4), decoration: BoxDecoration(color: const Color(0xFFFEF3C7).withAlpha(30), borderRadius: BorderRadius.circular(8)), child: Text('In Stock (${widget.product.stock})', style: const TextStyle(color: Color(0xFF92400E), fontSize: 12, fontWeight: FontWeight.w700))), const Spacer(), Text('\$${widget.product.price.toStringAsFixed(2)}', style: TextStyle(color: textColor, fontSize: 24, fontWeight: FontWeight.w900))]),
            const SizedBox(height: 20),
            Text('Description', style: TextStyle(color: textColor, fontWeight: FontWeight.w800, fontSize: 18)),
            const SizedBox(height: 8),
            Text(widget.product.description.isEmpty ? 'No description available for this product.' : widget.product.description, style: TextStyle(color: mutedColor, fontSize: 14, height: 1.6)),
            const SizedBox(height: 20),
            Text('Specifications', style: TextStyle(color: textColor, fontWeight: FontWeight.w800, fontSize: 18)),
            const SizedBox(height: 12),
            _specRow('SKU', widget.product.sku, cardColor, textColor, mutedColor),
            _specRow('Category', widget.product.category, cardColor, textColor, mutedColor),
            _specRow('Warranty', widget.product.warranty.isEmpty ? '1 Year Limited' : widget.product.warranty, cardColor, textColor, mutedColor),
            StreamBuilder<List<Map<String, dynamic>>>(
              stream: FirebaseService.instance.streamProductReviews(widget.product.id.isNotEmpty ? widget.product.id : widget.product.name),
              builder: (context, snap) {
                final reviews = snap.data ?? const <Map<String, dynamic>>[];
                final valid = reviews.where((r) => ((r['rating'] as num?)?.toDouble() ?? 0) > 0).toList();
                final avg = valid.isEmpty ? (widget.ratingSummary.count > 0 ? widget.ratingSummary.average : widget.product.rating) : valid.map((r) => (r['rating'] as num).toDouble()).reduce((a, b) => a + b) / valid.length;
                final count = valid.isEmpty ? widget.ratingSummary.count : valid.length;
                return _specRow('Rating', count > 0 ? '${avg.toStringAsFixed(1)} / 5.0 (${count} review${count == 1 ? '' : 's'})' : (avg > 0 ? '${avg.toStringAsFixed(1)} / 5.0' : 'No ratings yet'), cardColor, textColor, mutedColor);
              },
            ),
            const SizedBox(height: 24),
            Row(children: [
              Expanded(child: Text('Quantity', style: TextStyle(color: textColor, fontWeight: FontWeight.w800, fontSize: 16))),
              Row(children: [
                IconButton(onPressed: _quantity > 1 ? () => setState(() => _quantity--) : null, icon: const Icon(Icons.remove_circle_outlined), color: kPrimaryColor),
                Text('$_quantity', style: TextStyle(color: textColor, fontWeight: FontWeight.w900, fontSize: 18)),
                IconButton(onPressed: _quantity < widget.product.stock ? () => setState(() => _quantity++) : null, icon: const Icon(Icons.add_circle_outlined), color: kPrimaryColor),
              ]),
            ]),
            const SizedBox(height: 24),
            GradientButton(onPressed: () { widget.onAddToCart(); Navigator.pop(context); }, child: Text('Add to Cart (Ã—$_quantity)'), isDisabled: widget.product.stock == 0 || _quantity > widget.product.stock),
            const SizedBox(height: 16),
            OutlinedButton.icon(onPressed: () => _showRateDialog(cardColor, textColor, mutedColor), icon: const Icon(Icons.star_rate_rounded, color: Color(0xFFFBBF24)), label: const Text('Rate this product')),
            const SizedBox(height: 12),
            OutlineGradientButton(onPressed: () => Navigator.pop(context), borderColor: kPrimaryColor, gradientColors: const [kSurfaceDark, kCardDark], child: const Text('Cancel')),
          ]))),
        ],
      ),
    );
  }

  Widget _specRow(String label, String value, Color cardColor, Color textColor, Color mutedColor) {
    return Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Row(children: [
      Container(width: 110, child: Text(label, style: TextStyle(color: mutedColor, fontSize: 13, fontWeight: FontWeight.w600))),
      Expanded(child: Text(value, style: TextStyle(color: textColor, fontSize: 13, fontWeight: FontWeight.w500))),
    ]));
  }
}
