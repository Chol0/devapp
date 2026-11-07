import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { firestoreDb, firebaseAuth, getCurrentUserRole, friendlyFirebaseError } from '../store/firestoreSync';

type ResponseOverride = { keywords: string; response: string };

const F = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <div>
    <label className="form-label">{label}</label>
    {children}
    {hint && <div style={{ fontSize: 11, color: '#6b7fa8', marginTop: 6, lineHeight: 1.4 }}>{hint}</div>}
  </div>
);

const DEFAULT_CONFIG = {
  active: true,
  replyMode: 'admin_firebase', // admin-controlled replies using Firebase config; optional external AI via deployed function
  defaultReply: 'Thanks for your message. Please ask about our products, prices, stock, store hours, delivery, or how to order.',
  storeName: 'NexTech M-Commerce',
  storeAddress: '',
  storePhone: '',
  storeOwner: '',
  businessHours: '',
  deliveryInfo: '',
  faqs: '',
  chatbotInstructions: 'Be helpful, factual, and use only configured store information and real Firestore product data. Never invent prices or stock.',
  suggestedQuestions: [
    'Recommend products under ₱1000',
    'What laptops do you have?',
    'How do I place an order?',
    'What are your store hours?',
    'What is your delivery information?',
  ] as string[],
  responseOverrides: [] as ResponseOverride[], // admin-typed: keyword(s) -> what assistant should say
};

type Config = typeof DEFAULT_CONFIG;

export default function ChatbotManagement() {
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [suggestionsText, setSuggestionsText] = useState(DEFAULT_CONFIG.suggestedQuestions.join('\n'));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string>('');
  const [editText, setEditText] = useState('');
  const [msgInfo, setMsgInfo] = useState('');

  const loadMessages = async () => {
    try {
      const uid = firebaseAuth.currentUser?.uid;
      if (!uid || (await getCurrentUserRole(uid)) !== 'admin') return;
      const snap = await getDocs(query(collection(firestoreDb, 'chatbot_messages'), orderBy('createdAt', 'desc'), limit(60))).catch(async () => getDocs(query(collection(firestoreDb, 'chatbot_messages'), limit(60))));
      setMessages(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    } catch (err) {
      setMsgInfo(friendlyFirebaseError(err));
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const uid = firebaseAuth.currentUser?.uid;
        if (uid) setIsAdmin((await getCurrentUserRole(uid)) === 'admin');
        const snap = await getDoc(doc(firestoreDb, 'chatbot_config', 'default'));
        if (snap.exists()) {
          const data = snap.data() as any;
          const merged: Config = {
            ...DEFAULT_CONFIG,
            ...data,
            suggestedQuestions: Array.isArray(data.suggestedQuestions) && data.suggestedQuestions.length ? data.suggestedQuestions.map(String) : DEFAULT_CONFIG.suggestedQuestions,
            responseOverrides: Array.isArray(data.responseOverrides)
              ? data.responseOverrides.map((o: any) => ({ keywords: String(o?.keywords || ''), response: String(o?.response || '') })).filter((o: ResponseOverride) => o.keywords.trim() && o.response.trim())
              : [],
          };
          setConfig(merged);
          setSuggestionsText(merged.suggestedQuestions.join('\n'));
        }
        await loadMessages();
      } catch (err) {
        setError(friendlyFirebaseError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const saveMessageEdit = async (id: string) => {
    setMsgInfo(''); setError('');
    try {
      const uid = firebaseAuth.currentUser?.uid;
      if (!uid || (await getCurrentUserRole(uid)) !== 'admin') throw new Error('Only authorized administrators can edit chatbot messages.');
      await updateDoc(doc(firestoreDb, 'chatbot_messages', id), {
        content: editText.trim(),
        editedByAdmin: true,
        editedAt: serverTimestamp(),
        editedBy: uid,
        updatedAt: serverTimestamp(),
      });
      setEditingId(''); setEditText('');
      setMsgInfo('Assistant message updated in Firebase.');
      await loadMessages();
    } catch (err) {
      setError(friendlyFirebaseError(err));
    }
  };

  const save = async () => {
    setSaving(true); setError(''); setInfo('');
    try {
      const uid = firebaseAuth.currentUser?.uid;
      if (!uid) throw new Error('Not signed in.');
      if ((await getCurrentUserRole(uid)) !== 'admin') throw new Error('Only authorized administrators can edit chatbot configuration.');
      const suggestedQuestions = suggestionsText.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 8);
      const responseOverrides = (config.responseOverrides || []).map(o => ({ keywords: String(o.keywords || '').trim(), response: String(o.response || '').trim() })).filter(o => o.keywords && o.response).slice(0, 50);
      const payload = { ...config, suggestedQuestions, responseOverrides, updatedAt: serverTimestamp(), updatedBy: uid };
      await setDoc(doc(firestoreDb, 'chatbot_config', 'default'), payload, { merge: true });
      setConfig(c => ({ ...c, suggestedQuestions, responseOverrides }));
      setInfo('Chatbot configuration saved to Firestore (chatbot_config/default).');
    } catch (err) {
      setError(friendlyFirebaseError(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: 40, color: '#c8d8f0' }}>Loading chatbot configuration from Firestore…</div>;

  return (
    <div className="page-fade" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {isAdmin === false && <div style={{ background: 'rgba(245,158,11,0.12)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>This account is not an admin. You can view fields, but saving will be blocked by UI and Firestore rules.</div>}
      {error && <div style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>{error}</div>}
      {info && <div style={{ background: 'rgba(16,185,129,0.12)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>{info}</div>}

      <div className="admin-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 20, color: '#e2eaf8' }}>AI Chatbot Management</div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#8b9fc8', marginTop: 4 }}>Admin controls chatbot replies via Firebase <code>chatbot_config/default</code>. Customers get admin keyword responses first, then admin-configured store/product info from Firestore. Real <code>product</code> data is read-only; the assistant never modifies orders/payments/stock.</div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#c8d8f0', fontSize: 13 }}>
            <input type="checkbox" checked={config.active} onChange={e => setConfig({ ...config, active: e.target.checked })} />
            Chatbot Active
          </label>
        </div>

        <F label="Default Reply (when no keyword/admin rule matches)" hint="Admin-controlled fallback text saved in Firebase. Used for unmatched questions after checking admin responses and store/product facts."><textarea className="admin-input" style={{ minHeight: 90 }} value={(config as any).defaultReply || ''} onChange={e => setConfig({ ...config, defaultReply: e.target.value } as any)} placeholder="Type the default response customers should see..." /></F>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <F label="Store Name"><input className="admin-input" value={config.storeName} onChange={e => setConfig({ ...config, storeName: e.target.value })} /></F>
          <F label="Store Owner"><input className="admin-input" value={config.storeOwner} onChange={e => setConfig({ ...config, storeOwner: e.target.value })} /></F>
          <F label="Store Phone / Number"><input className="admin-input" value={config.storePhone} onChange={e => setConfig({ ...config, storePhone: e.target.value })} /></F>
          <F label="Business Hours"><input className="admin-input" value={config.businessHours} onChange={e => setConfig({ ...config, businessHours: e.target.value })} placeholder="e.g., Mon–Sat 9:00 AM–6:00 PM" /></F>
        </div>
        <F label="Store Address"><textarea className="admin-input" value={config.storeAddress} onChange={e => setConfig({ ...config, storeAddress: e.target.value })} /></F>
        <F label="Delivery Information"><textarea className="admin-input" value={config.deliveryInfo} onChange={e => setConfig({ ...config, deliveryInfo: e.target.value })} placeholder="Delivery areas, fees, timelines, COD/pickup notes" /></F>
        <F label="Frequently Asked Questions"><textarea className="admin-input" style={{ minHeight: 120 }} value={config.faqs} onChange={e => setConfig({ ...config, faqs: e.target.value })} placeholder="Q: ...\nA: ..." /></F>
        <F label="Chatbot Instructions" hint="Admin guidance for tone/behavior. Security rules still apply: use only real Firestore/config data; never modify orders/payments/stock; never expose private customer info."><textarea className="admin-input" style={{ minHeight: 110 }} value={config.chatbotInstructions} onChange={e => setConfig({ ...config, chatbotInstructions: e.target.value })} /></F>
        <F label="Suggested Questions (one per line, max 8)"><textarea className="admin-input" style={{ minHeight: 110 }} value={suggestionsText} onChange={e => setSuggestionsText(e.target.value)} /></F>

        <div style={{ borderTop: '1px solid #1e2d4a', paddingTop: 16 }}>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 16, color: '#e2eaf8', marginBottom: 6 }}>Admin Responses (saved in Firebase)</div>
          <div style={{ fontSize: 12, color: '#8b9fc8', marginBottom: 12, lineHeight: 1.5 }}>Type what the assistant should say when a customer message contains matching keywords. These are stored in <code>chatbot_config/default.responseOverrides</code> (Firebase) and take priority in the secure function and mobile fallback. You can edit/remove them anytime.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(config.responseOverrides || []).map((o, idx) => (
              <div key={idx} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #1e2d4a', borderRadius: 12, padding: 12, display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#6b7fa8', fontFamily: 'JetBrains Mono, monospace' }}>Response #{idx + 1}</span>
                  <button className="btn-danger btn-sm" type="button" onClick={() => setConfig(c => ({ ...c, responseOverrides: c.responseOverrides.filter((_, i) => i !== idx) }))}>Remove</button>
                </div>
                <F label="When customer message contains keywords (comma or new line)"><input className="admin-input" value={o.keywords} placeholder="e.g., refund, return, warranty" onChange={e => setConfig(c => ({ ...c, responseOverrides: c.responseOverrides.map((x, i) => i === idx ? { ...x, keywords: e.target.value } : x) }))} /></F>
                <F label="Assistant should say (admin can edit)"><textarea className="admin-input" style={{ minHeight: 90 }} value={o.response} placeholder="Type the exact/helpful response the chatbot should give..." onChange={e => setConfig(c => ({ ...c, responseOverrides: c.responseOverrides.map((x, i) => i === idx ? { ...x, response: e.target.value } : x) }))} /></F>
              </div>
            ))}
          </div>
          <button className="btn-ghost" type="button" style={{ marginTop: 12 }} onClick={() => setConfig(c => ({ ...c, responseOverrides: [...(c.responseOverrides || []), { keywords: '', response: '' }] }))}>+ Add Admin Response</button>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save Chatbot Configuration'}</button>
        </div>
      </div>

      <div className="admin-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 16, color: '#e2eaf8' }}>Edit Assistant Messages (what the chatbot said)</div>
            <div style={{ fontSize: 12, color: '#8b9fc8', marginTop: 4 }}>Admin-only. Recent messages from <code>chatbot_messages</code> in Firebase. Editing updates the saved assistant message content (requires updated Firestore rules published).</div>
          </div>
          <button className="btn-ghost btn-sm" type="button" onClick={loadMessages}>Refresh</button>
        </div>
        {msgInfo && <div style={{ background: 'rgba(16,185,129,0.12)', color: '#6ee7b7', borderRadius: 8, padding: '8px 10px', fontSize: 12 }}>{msgInfo}</div>}
        {!messages.length && <div style={{ color: '#6b7fa8', fontSize: 13 }}>No recent chatbot messages loaded (or not authorized).</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflow: 'auto' }}>
          {messages.map((m) => {
            const isAssistant = String(m.role || '') === 'assistant';
            const isEditing = editingId === m.id;
            return (
              <div key={m.id} style={{ border: '1px solid #1e2d4a', borderRadius: 10, padding: 12, background: 'rgba(255,255,255,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: 11, color: isAssistant ? '#93c5fd' : '#c4b5fd', fontFamily: 'JetBrains Mono, monospace' }}>{String(m.role || 'message').toUpperCase()} · user {String(m.userId || '').slice(0, 8)}… {m.editedByAdmin ? '· edited by admin' : ''}</div>
                  {isAssistant && !isEditing && <button className="btn-secondary btn-sm" type="button" onClick={() => { setEditingId(m.id); setEditText(String(m.content || '')); }}>Edit what it said</button>}
                </div>
                {isEditing ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <textarea className="admin-input" style={{ minHeight: 100 }} value={editText} onChange={e => setEditText(e.target.value)} />
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button className="btn-ghost btn-sm" type="button" onClick={() => { setEditingId(''); setEditText(''); }}>Cancel</button>
                      <button className="btn-primary btn-sm" type="button" onClick={() => saveMessageEdit(m.id)}>Save to Firebase</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: '#c8d8f0', fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{String(m.content || '')}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="admin-card" style={{ padding: 18, fontSize: 13, color: '#8b9fc8', lineHeight: 1.6 }}>
        <b style={{ color: '#c8d8f0' }}>Integration status:</b> The mobile app calls the secure Firebase callable function <code>chatbotReply</code> and falls back to a transparent Firestore-grounded local response only when the backend is unavailable/not deployed. <b style={{ color: '#fcd34d' }}>Do not put AI API keys in Flutter/web client code.</b> Configure <code>GEMINI_API_KEY</code> as a Firebase Functions secret and deploy <code>functions/</code>. Gemini/Google AI usage may require billing and can incur costs — review pricing before enabling production traffic.
      </div>
    </div>
  );
}
