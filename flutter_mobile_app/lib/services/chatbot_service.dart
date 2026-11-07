import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'firebase_service.dart';

class ChatbotResponseOverride {
  final String keywords; // comma/newline separated keywords/phrases admin typed
  final String response; // what the assistant should say (admin can edit)
  const ChatbotResponseOverride({required this.keywords, required this.response});
  factory ChatbotResponseOverride.fromMap(Map<dynamic, dynamic> m) => ChatbotResponseOverride(
        keywords: (m['keywords'] ?? '').toString(),
        response: (m['response'] ?? '').toString(),
      );
  Map<String, dynamic> toMap() => {'keywords': keywords, 'response': response};
}

class ChatbotConfig {
  final bool active;
  final String storeName;
  final String storeAddress;
  final String storePhone;
  final String storeOwner;
  final String businessHours;
  final String deliveryInfo;
  final String faqs;
  final String chatbotInstructions;
  final String defaultReply; // admin-controlled fallback reply text
  final List<String> suggestedQuestions;
  final List<ChatbotResponseOverride> responseOverrides; // admin-typed responses in Firebase

  const ChatbotConfig({
    this.active = true,
    this.storeName = 'NexTech M-Commerce',
    this.storeAddress = '',
    this.storePhone = '',
    this.storeOwner = '',
    this.businessHours = '',
    this.deliveryInfo = '',
    this.faqs = '',
    this.chatbotInstructions = '',
    this.defaultReply = '',
    this.suggestedQuestions = const [
      'Recommend products under ₱1000',
      'What laptops do you have?',
      'How do I place an order?',
      'What are your store hours?',
      'What is your delivery information?',
    ],
    this.responseOverrides = const [],
  });

  factory ChatbotConfig.fromMap(Map<String, dynamic>? data) {
    if (data == null) return const ChatbotConfig();
    final suggestions = data['suggestedQuestions'];
    final overrides = data['responseOverrides'];
    return ChatbotConfig(
      active: data['active'] != false,
      storeName: (data['storeName'] ?? 'NexTech M-Commerce').toString(),
      storeAddress: (data['storeAddress'] ?? '').toString(),
      storePhone: (data['storePhone'] ?? '').toString(),
      storeOwner: (data['storeOwner'] ?? '').toString(),
      businessHours: (data['businessHours'] ?? '').toString(),
      deliveryInfo: (data['deliveryInfo'] ?? '').toString(),
      faqs: (data['faqs'] ?? '').toString(),
      chatbotInstructions: (data['chatbotInstructions'] ?? '').toString(),
      defaultReply: (data['defaultReply'] ?? data['fallbackReply'] ?? '').toString(),
      suggestedQuestions: suggestions is List
          ? suggestions.map((e) => e.toString()).where((e) => e.trim().isNotEmpty).take(8).toList()
          : const ChatbotConfig().suggestedQuestions,
      responseOverrides: overrides is List
          ? overrides.whereType<Map>().map((e) => ChatbotResponseOverride.fromMap(e)).where((o) => o.keywords.trim().isNotEmpty && o.response.trim().isNotEmpty).toList()
          : const [],
    );
  }
}

class ChatbotService {
  ChatbotService._();
  static final instance = ChatbotService._();

  FirebaseFirestore get _db => FirebaseService.instance.firestore;
  FirebaseFunctions get _functions => FirebaseFunctions.instanceFor(region: 'us-central1');

  Stream<ChatbotConfig> streamConfig() {
    return _db.collection('chatbot_config').doc('default').snapshots().map((d) => ChatbotConfig.fromMap(d.data()));
  }

  Stream<List<Map<String, dynamic>>> streamMyMessages(String userId) {
    final col = _db.collection('chatbot_messages');
    final controller = StreamController<List<Map<String, dynamic>>>.broadcast();
    StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? sub;

    void emit(QuerySnapshot<Map<String, dynamic>> s) {
      final rows = s.docs.map((d) => <String, dynamic>{...d.data(), 'id': d.id}).toList();
      rows.sort((a, b) {
        final at = a['createdAt'];
        final bt = b['createdAt'];
        final am = at is Timestamp ? at.millisecondsSinceEpoch : 0;
        final bm = bt is Timestamp ? bt.millisecondsSinceEpoch : 0;
        return am.compareTo(bm);
      });
      if (!controller.isClosed) controller.add(rows);
    }

    void listenOrdered() {
      sub = col
          .where('userId', isEqualTo: userId)
          .orderBy('createdAt', descending: false)
          .limit(100)
          .snapshots()
          .listen(emit, onError: (Object e, StackTrace st) {
        // ignore: avoid_print
        print('[ChatbotService] ordered messages stream failed, falling back: $e');
        sub?.cancel();
        sub = col.where('userId', isEqualTo: userId).limit(100).snapshots().listen(emit, onError: (Object e2, StackTrace st2) {
          // ignore: avoid_print
          print('[ChatbotService] messages stream error: $e2');
          if (!controller.isClosed) controller.addError(e2, st2);
        });
      });
    }

    listenOrdered();
    controller.onCancel = () async => sub?.cancel();
    return controller.stream;
  }

  Future<void> saveMessage({required String userId, required String role, required String content}) async {
    try {
      await _db.collection('chatbot_messages').add({
        'userId': userId,
        'role': role, // 'user' | 'assistant'
        'content': content,
        'createdAt': FieldValue.serverTimestamp(),
      });
    } catch (e) {
      // ignore: avoid_print
      print('[ChatbotService] saveMessage failed (publish firestore.rules for chatbot_messages): $e');
      rethrow;
    }
  }

  Future<Map<String, dynamic>> askAssistant({required String message, required List<Map<String, dynamic>> history}) async {
    final callable = _functions.httpsCallable('chatbotReply', options: HttpsCallableOptions(timeout: const Duration(seconds: 60)));
    final result = await callable.call(<String, dynamic>{
      'message': message,
      'history': history.map((h) => {'role': h['role'], 'content': h['content']}).toList(),
    });
    final data = result.data;
    if (data is Map) return Map<String, dynamic>.from(data);
    return {'reply': data?.toString() ?? 'No response received.', 'source': 'unknown'};
  }

  // Transparent local fallback using real Firestore data and ADMIN-TYPED Firebase responses when backend unavailable.
  // Priority: admin responseOverrides (chatbot_config/default in Firebase) -> grounded store/product facts from Firestore.
  // Admin-typed responses saved in Firebase (chatbot_config/default.responseOverrides).
  // Admin controls replies: exact-ish keyword/phrase match (case-insensitive). Also tries matching
  // the full trimmed question against each keyword for suggested-question style entries.
  String? matchAdminOverride(ChatbotConfig cfg, String message) {
    final q = message.toLowerCase().trim();
    if (q.isEmpty) return null;
    for (final o in cfg.responseOverrides) {
      final resp = o.response.trim();
      if (resp.isEmpty) continue;
      final keys = o.keywords
          .toLowerCase()
          .split(RegExp(r'[,\n;\r]+'))
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toList();
      if (keys.isEmpty) continue;
      // Prefer full-question match for suggested/admin-defined questions.
      for (final k in keys) {
        if (k.length >= 2 && (q == k || q.contains(k) || k.contains(q) && q.length >= 4)) return resp;
      }
    }
    return null;
  }

  Future<String> groundedLocalFallback(String message, {ChatbotConfig? config}) async {
    try {
      final cfg = config ?? ChatbotConfig.fromMap((await _db.collection('chatbot_config').doc('default').get()).data());
      if (!cfg.active) return 'The AI shopping assistant is currently unavailable.';
      // 1) Admin-controlled: explicit keyword responses typed by admin in Firebase AI Chatbot Management.
      final admin = matchAdminOverride(cfg, message);
      if (admin != null && admin.isNotEmpty) return admin;

      final q = message.toLowerCase().trim();
      // 2) Admin-configured store facts (admin controls via chatbot_config/default).
      if (RegExp(r'\b(hour|open|close|time|schedule)\b').hasMatch(q)) {
        return cfg.businessHours.isNotEmpty ? cfg.businessHours : (cfg.defaultReply.isNotEmpty ? cfg.defaultReply : 'Business hours are not configured yet. Please ask the store admin.');
      }
      if (RegExp(r'\b(address|location|where|store|shop|contact|phone|number|owner)\b').hasMatch(q)) {
        final parts = <String>[];
        if (cfg.storeName.isNotEmpty) parts.add('Store: ${cfg.storeName}');
        if (cfg.storeAddress.isNotEmpty) parts.add('Address: ${cfg.storeAddress}');
        if (cfg.storePhone.isNotEmpty) parts.add('Phone: ${cfg.storePhone}');
        if (cfg.storeOwner.isNotEmpty) parts.add('Owner: ${cfg.storeOwner}');
        if (cfg.businessHours.isNotEmpty) parts.add('Hours: ${cfg.businessHours}');
        if (parts.isNotEmpty) return parts.join('\n');
        return cfg.defaultReply.isNotEmpty ? cfg.defaultReply : 'Store information is not configured yet. Please ask the store admin.';
      }
      if (RegExp(r'\b(deliver|shipping|ship|pickup|cod|cash on delivery)\b').hasMatch(q)) {
        return cfg.deliveryInfo.isNotEmpty ? cfg.deliveryInfo : (cfg.defaultReply.isNotEmpty ? cfg.defaultReply : 'Delivery information is not configured yet. Please ask the store admin.');
      }
      if (RegExp(r'\b(faq|question|return|refund|warranty|policy)\b').hasMatch(q)) {
        return cfg.faqs.isNotEmpty ? cfg.faqs : (cfg.defaultReply.isNotEmpty ? cfg.defaultReply : 'FAQs are not configured yet. Please ask the store admin.');
      }
      if (RegExp(r'\b(order|checkout|buy|cart|purchase|pay)\b').hasMatch(q)) {
        final base = 'How to place an order:\n1. Browse products.\n2. Add items to cart.\n3. Enter delivery details.\n4. Choose payment and submit checkout.\n5. Track status in My Orders.';
        return cfg.deliveryInfo.isNotEmpty ? '$base\n\nDelivery: ${cfg.deliveryInfo}' : base;
      }

      // 3) Real Firestore product data (read-only facts) — used for product/price/budget questions.
      final prodSnap = await _db.collection('product').get();
      num? budget;
      final m = RegExp(r'(?:₱|php|under|below|budget|up to)\s*([0-9][0-9,]*)|([0-9][0-9,]*)\s*(?:pesos|php|₱)', caseSensitive: false).firstMatch(message);
      final raw = m?.group(1) ?? m?.group(2);
      if (raw != null) budget = num.tryParse(raw.replaceAll(',', ''));
      var products = prodSnap.docs.map((d) {
        final data = d.data();
        double p = 0;
        final pv = data['price'] ?? data['sellingPrice'] ?? data['unitPrice'];
        if (pv is num) { p = pv.toDouble(); } else if (pv != null) { p = double.tryParse(pv.toString().replaceAll(RegExp(r'[^0-9.-]'), '')) ?? 0; }
        int stock = 0;
        final sv = data['stock'] ?? data['quantity'];
        if (sv is num) { stock = sv.toInt(); } else if (sv != null) { stock = int.tryParse(sv.toString()) ?? 0; }
        return {'name': (data['name'] ?? data['Name'] ?? '').toString(), 'category': (data['category'] ?? '').toString(), 'price': p, 'stock': stock, 'description': (data['description'] ?? '').toString()};
      }).where((p) => (p['name'] as String).isNotEmpty).toList();
      if (budget != null) products = products.where((p) => (p['price'] as double) <= budget!).toList();
      final tokens = q.split(RegExp(r'[^a-z0-9]+')).where((t) => t.length >= 2);
      products.sort((a, b) {
        int score(Map<String, dynamic> p) { final hay = '${p['name']} ${p['category']} ${p['description']}'.toLowerCase(); return tokens.where(hay.contains).length; }
        return score(b).compareTo(score(a));
      });
      final top = products.take(5).toList();
      final asksAboutProducts = budget != null || RegExp(r'\b(product|products|recommend|suggest|laptop|phone|item|price|stock|available|category|budget|cheap|afford)\b').hasMatch(q);
      if (top.isNotEmpty && asksAboutProducts) {
        return 'Products from store inventory${budget != null ? " (budget ~₱${budget.toStringAsFixed(0)})" : ""}:\n${top.map((p) => "- ${p['name']} (${p['category']}) — ₱${(p['price'] as double).toStringAsFixed(2)}, stock ${p['stock']}").join("\n")}\n\nAsk for a specific product name for details.';
      }
      // 4) Admin-controlled default/fallback.
      if (cfg.defaultReply.trim().isNotEmpty) return cfg.defaultReply.trim();
      if (top.isNotEmpty) {
        return 'Available products:\n${top.map((p) => "- ${p['name']} — ₱${(p['price'] as double).toStringAsFixed(2)} (${p['category']}, stock ${p['stock']})").join("\n")}';
      }
      return 'I can help with store info, delivery, ordering, and product questions. Ask the store admin to configure chatbot replies in Admin → AI Chatbot for more specific answers.';
    } catch (e) {
      // ignore: avoid_print
      print('[ChatbotService] groundedLocalFallback failed: $e');
      final msg = e.toString();
      if (msg.contains('permission-denied')) {
        return 'I cannot read store/product data right now (Firestore permission denied). Publish the corrected local firestore.rules and sign in. Admin can add keyword responses in chatbot_config/default.';
      }
      return 'Chatbot is temporarily unavailable ($msg). Please try again.';
    }
  }
}
