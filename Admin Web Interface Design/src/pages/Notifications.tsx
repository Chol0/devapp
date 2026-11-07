import { useEffect, useMemo, useState } from 'react';
import { subscribeNotifications, markNotificationRead, deleteNotification, createNotification, friendlyFirebaseError } from '../store/firestoreSync';
import { firebaseAuth } from '../store/firestoreSync';

const typeConfig: Record<string, { color: string; label: string; icon: string }> = {
  order: { color: '#4f8ef7', label: 'Order', icon: '🛍' },
  payment: { color: '#f59e0b', label: 'Payment', icon: '💳' },
  stock: { color: '#ef4444', label: 'Stock', icon: '📦' },
  customer: { color: '#10b981', label: 'Customer', icon: '👤' },
  system: { color: '#8b5cf6', label: 'System', icon: '⚙️' }
};

export default function Notifications() {
  const [notifs, setNotifs] = useState<any[]>([]);
  const [filterType, setFilterType] = useState('');
  const [filterRead, setFilterRead] = useState('');
  const [error, setError] = useState('');

  useEffect(() => subscribeNotifications(setNotifs, (e) => setError(friendlyFirebaseError(e))), []);

  const filtered = useMemo(() => notifs.filter(n => {
    const t = !filterType || n.type === filterType;
    const r = !filterRead || (filterRead === 'unread' ? !n.read : !!n.read);
    return t && r;
  }), [notifs, filterType, filterRead]);

  const markAllRead = async () => {
    try { await Promise.all(notifs.filter(n => !n.read).map(n => markNotificationRead(n.id))); }
    catch (e) { setError(friendlyFirebaseError(e)); }
  };
  const markRead = async (id: string) => { try { await markNotificationRead(id); } catch (e) { setError(friendlyFirebaseError(e)); } };
  const del = async (id: string) => { try { await deleteNotification(id); } catch (e) { setError(friendlyFirebaseError(e)); } };
  const createTest = async () => {
    try { await createNotification({ userId: firebaseAuth.currentUser?.uid || '', title: 'Admin notification', message: 'This notification was created from Admin Dashboard and stored in Firestore.', type: 'system' }); }
    catch (e) { setError(friendlyFirebaseError(e)); }
  };

  const unreadCount = notifs.filter(n => !n.read).length;

  return (
    <div className="page-fade" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {error && <div style={{ color: '#fca5a5', fontSize: 13 }}>{error}</div>}
      <div className="admin-card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 600, color: '#8b9fc8' }}>Filter by type:</span>
            {['', ...Object.keys(typeConfig)].map(t => (
              <button key={t} onClick={() => setFilterType(t)}
                style={{ padding: '5px 12px', borderRadius: 99, border: '1px solid', cursor: 'pointer', fontFamily: 'Outfit, sans-serif', fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
                  background: filterType === t ? (t ? typeConfig[t].color + '22' : 'rgba(79,142,247,0.12)') : 'transparent',
                  borderColor: filterType === t ? (t ? typeConfig[t].color : '#4f8ef7') : '#1e2d4a',
                  color: filterType === t ? (t ? typeConfig[t].color : '#4f8ef7') : '#6b7fa8' }}>
                {t ? typeConfig[t].label : 'All'}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['', 'All'], ['unread', 'Unread'], ['read', 'Read']].map(([v, l]) => (
              <button key={v} onClick={() => setFilterRead(v)}
                style={{ padding: '5px 12px', borderRadius: 99, border: '1px solid', cursor: 'pointer', fontFamily: 'Outfit, sans-serif', fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
                  background: filterRead === v ? 'rgba(79,142,247,0.12)' : 'transparent', borderColor: filterRead === v ? '#4f8ef7' : '#1e2d4a', color: filterRead === v ? '#4f8ef7' : '#6b7fa8' }}>
                {l}
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <button className="btn-ghost" onClick={createTest}>Create Test</button>
          {unreadCount > 0 && <button className="btn-secondary" onClick={markAllRead}>Mark All as Read ({unreadCount})</button>}
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: '#4b5e82', fontFamily: 'JetBrains Mono, monospace' }}>Firestore collection: notifications (real-time)</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 && (
          <div className="admin-card" style={{ padding: '40px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔔</div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 16, fontWeight: 600, color: '#6b7fa8' }}>No notifications found</div>
            <div style={{ fontSize: 13, color: '#4b5e82', marginTop: 6 }}>Order status updates and admin actions can create Firestore notification documents automatically.</div>
          </div>
        )}
        {filtered.map(n => {
          const config = typeConfig[String(n.type)] || typeConfig.system;
          return (
            <div key={n.id} className="admin-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: 14, opacity: n.read ? 0.7 : 1, transition: 'all 0.15s' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: config.color, marginTop: 4, flexShrink: 0, boxShadow: n.read ? 'none' : `0 0 8px ${config.color}80` }} />
              <div style={{ width: 36, height: 36, borderRadius: 9, background: config.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{config.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 700, color: n.read ? '#8b9fc8' : '#e2eaf8' }}>{String(n.title || 'Notification')}</span>
                  {!n.read && <span style={{ background: config.color + '22', color: config.color, borderRadius: 99, fontSize: 9, fontWeight: 700, padding: '2px 7px', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.06em', textTransform: 'uppercase', border: `1px solid ${config.color}44` }}>NEW</span>}
                  <span style={{ background: '#0f1928', color: '#4b5e82', borderRadius: 6, fontSize: 9, fontWeight: 600, padding: '2px 7px', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', border: '1px solid #1e2d4a' }}>{config.label}</span>
                  {n.userId ? <span style={{ color: '#3a4f72', fontSize: 10 }}>user: {String(n.userId).slice(0,8)}…</span> : null}
                </div>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#6b7fa8', lineHeight: 1.5 }}>{String(n.message || '')}</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#3a4f72', marginTop: 5 }}>{String(n.updatedAt || n.createdAt || n.time || '')} {n.orderId ? `· order ${n.orderId}` : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {!n.read && <button onClick={() => markRead(n.id)} className="btn-ghost btn-sm">Mark Read</button>}
                <button onClick={() => del(n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3a4f72', padding: '4px', borderRadius: 6, display: 'flex', alignItems: 'center' }} title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
