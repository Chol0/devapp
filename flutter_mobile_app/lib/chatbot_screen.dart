import 'package:flutter/material.dart';
import 'services/firebase_service.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'services/chatbot_service.dart';

class ChatbotScreen extends StatefulWidget {
  const ChatbotScreen({super.key, required this.userId});
  final String userId;

  @override
  State<ChatbotScreen> createState() => _ChatbotScreenState();
}

class _ChatbotScreenState extends State<ChatbotScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  bool _sending = false;
  String? _error;
  ChatbotConfig _config = const ChatbotConfig();

  static const _bg = Color(0xFF0F172A);
  static const _card = Color(0xFF111827);
  static const _primary = Color(0xFF4F46E5);
  static const _muted = Color(0xFF94A3B8);

  @override
  void initState() {
    super.initState();
    ChatbotService.instance.streamConfig().listen((c) {
      if (mounted) setState(() => _config = c);
    });
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent + 80, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
    });
  }

  Future<void> _send([String? preset]) async {
    final text = (preset ?? _input.text).trim();
    if (text.isEmpty || _sending) return;
    if (!_config.active) {
      setState(() => _error = 'The AI shopping assistant is currently unavailable.');
      return;
    }
    setState(() { _sending = true; _error = null; _input.clear(); });
    String? banner;
    try {
      try {
        await ChatbotService.instance.saveMessage(userId: widget.userId, role: 'user', content: text);
      } catch (e) {
        // ignore: avoid_print
        print('[Chatbot] could not save user message (continuing): $e');
      }

      var historyPayload = <Map<String, String>>[];
      try {
        final historySnap = await FirebaseService.instance.firestore
            .collection('chatbot_messages')
            .where('userId', isEqualTo: widget.userId)
            .limit(12)
            .get();
        final history = historySnap.docs.map((d) => d.data()).where((d) => d['content'] != null).toList();
        history.sort((a, b) {
          final at = a['createdAt']; final bt = b['createdAt'];
          return ((at is Timestamp ? at.millisecondsSinceEpoch : 0)).compareTo(bt is Timestamp ? bt.millisecondsSinceEpoch : 0);
        });
        historyPayload = history.map((h) => {'role': (h['role'] ?? 'user').toString(), 'content': (h['content'] ?? '').toString()}).toList();
      } catch (e) {
        // ignore: avoid_print
        print('[Chatbot] history load failed (continuing): $e');
      }

      String reply;
      // Always refresh config so replies reflect latest Admin AI Chatbot settings in Firebase.
      var cfg = _config;
      try {
        final snap = await FirebaseService.instance.firestore.collection('chatbot_config').doc('default').get();
        cfg = ChatbotConfig.fromMap(snap.data());
        if (mounted) setState(() => _config = cfg);
      } catch (e) {
        // ignore: avoid_print
        print('[Chatbot] config refresh failed, using cached: $e');
      }

      // Priority 1 (admin-controlled): keyword/phrase responses typed by admin in Admin -> AI Chatbot (Firebase chatbot_config/default).
      final adminReply = ChatbotService.instance.matchAdminOverride(cfg, text);
      if (adminReply != null && adminReply.isNotEmpty) {
        reply = adminReply;
      } else {
        // Priority 2: secure backend (if deployed) — also reads admin config + Firestore products server-side.
        try {
          final res = await ChatbotService.instance.askAssistant(message: text, history: historyPayload);
          reply = (res['reply'] ?? 'No response received.').toString();
        } catch (e) {
          // ignore: avoid_print
          print('[Chatbot] backend unavailable, using Firebase/admin fallback: $e');
          // Priority 3: Firebase/admin-config + real Firestore product fallback.
          reply = await ChatbotService.instance.groundedLocalFallback(text, config: cfg);
          final msg = e.toString();
          if (banner == null && msg.contains('permission-denied')) {
            banner = 'Unable to send message right now. Please try again.';
          }
        }
      }

      try {
        await ChatbotService.instance.saveMessage(userId: widget.userId, role: 'assistant', content: reply);
      } catch (e) {
        // ignore: avoid_print
        print('[Chatbot] could not save assistant message: $e');
      }
      if (mounted) setState(() => _error = banner);
      _scrollToBottom();
    } catch (e, st) {
      // ignore: avoid_print
      print('[Chatbot] send failed: $e');
      // ignore: avoid_print
      print(st);
      if (mounted) {
        setState(() => _error = 'Something went wrong. Please try again.');
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      appBar: AppBar(
        backgroundColor: _bg,
        elevation: 0,
        title: const Text('Shopping Assistant', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18)),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: Column(children: [
        if (!_config.active)
          Container(width: double.infinity, margin: const EdgeInsets.fromLTRB(16, 8, 16, 0), padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: const Color(0x33F59E0B), borderRadius: BorderRadius.circular(12)), child: const Text('Assistant is currently unavailable.', style: TextStyle(color: Color(0xFFFCD34D), fontSize: 13))),
        if (_error != null)
          Container(width: double.infinity, margin: const EdgeInsets.fromLTRB(16, 8, 16, 0), padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: const Color(0x334F46E5), borderRadius: BorderRadius.circular(12)), child: Text(_error!, style: const TextStyle(color: Color(0xFFC7D2FE), fontSize: 12))),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 6),
          child: Wrap(spacing: 8, runSpacing: 8, children: _config.suggestedQuestions.map((q) => ActionChip(
            label: Text(q, style: const TextStyle(color: Colors.white, fontSize: 12)),
            backgroundColor: _card,
            side: const BorderSide(color: Color(0xFF334155)),
            onPressed: _sending ? null : () => _send(q),
          )).toList()),
        ),
        Expanded(
          child: StreamBuilder<List<Map<String, dynamic>>>(
            stream: ChatbotService.instance.streamMyMessages(widget.userId),
            builder: (context, snap) {
              final msgs = snap.data ?? const [];
              if (snap.connectionState == ConnectionState.waiting && msgs.isEmpty) {
                return const Center(child: CircularProgressIndicator(color: _primary));
              }
              if (msgs.isEmpty) {
                return const Center(child: Padding(padding: EdgeInsets.all(24), child: Text('Ask about products, prices, categories, delivery, or how to place an order.', textAlign: TextAlign.center, style: TextStyle(color: _muted, fontSize: 14, height: 1.5))));
              }
              if (msgs.isEmpty) {
                return Center(child: Padding(padding: const EdgeInsets.all(24), child: Text('Ask about product prices, budget recommendations, categories, specs, store info, delivery, or how to place an order. I use real Firestore product/store data only.', textAlign: TextAlign.center, style: TextStyle(color: _muted, fontSize: 14, height: 1.5))));
              }
              _scrollToBottom();
              return ListView.builder(
                controller: _scroll,
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                itemCount: msgs.length + (_sending ? 1 : 0),
                itemBuilder: (context, i) {
                  if (_sending && i == msgs.length) {
                    return Align(alignment: Alignment.centerLeft, child: Container(margin: const EdgeInsets.only(top: 8), padding: const EdgeInsets.all(14), decoration: BoxDecoration(color: _card, borderRadius: BorderRadius.circular(16)), child: const Row(mainAxisSize: MainAxisSize.min, children: [SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: _primary)), SizedBox(width: 10), Text('Thinking...', style: TextStyle(color: _muted))])));
                  }
                  final m = msgs[i];
                  final isUser = (m['role'] ?? '') == 'user';
                  return Align(
                    alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
                    child: Container(
                      constraints: const BoxConstraints(maxWidth: 520),
                      margin: const EdgeInsets.only(top: 8),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(color: isUser ? _primary : _card, borderRadius: BorderRadius.circular(16), border: isUser ? null : Border.all(color: const Color(0xFF1E293B))),
                      child: Text((m['content'] ?? '').toString(), style: TextStyle(color: isUser ? Colors.white : const Color(0xFFE2E8F0), fontSize: 14, height: 1.45)),
                    ),
                  );
                },
              );
            },
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
            child: Row(children: [
              Expanded(child: TextField(
                controller: _input,
                minLines: 1,
                maxLines: 4,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(hintText: 'Type your message...', hintStyle: const TextStyle(color: _muted), filled: true, fillColor: _card, border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none), contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12)),
                onSubmitted: (_) => _send(),
              )),
              const SizedBox(width: 8),
              IconButton.filled(onPressed: _sending ? null : _send, style: IconButton.styleFrom(backgroundColor: _primary, disabledBackgroundColor: const Color(0xFF334155)), icon: _sending ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.send_rounded, color: Colors.white)),
            ]),
          ),
        ),
      ]),
    );
  }
}
