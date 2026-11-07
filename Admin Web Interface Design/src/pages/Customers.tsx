import { useEffect, useMemo, useState } from 'react';
import {
  subscribeUsersFromFirestore,
  subscribeOrdersFromFirestore,
  subscribeCustomerLocationsFromFirestore,
  updateUserRoleInFirestore,
  friendlyFirebaseError,
  firebaseAuth,
} from '../store/firestoreSync';

interface FirestoreUser { id: string; uid?: string; email?: string; fullName?: string; role?: string; createdAt?: unknown; updatedAt?: unknown; roleUpdatedAt?: unknown; roleUpdatedBy?: string; }
interface FirestoreOrder { id?: string; docId?: string; customerId?: string; customer?: string; customerEmail?: string; total?: number; orderStatus?: string; status?: string; paymentStatus?: string; createdAt?: unknown; date?: string; items?: any[]; products?: string[]; address?: any; }
interface CustomerLocation { id: string; userId?: string; email?: string; fullName?: string; phone?: string; street?: string; city?: string; state?: string; zipCode?: string; country?: string; updatedAt?: unknown; }

const roleBadge: Record<string, string> = { admin: 'badge-danger', customer: 'badge-success', guest: 'badge-neutral' };
const orderStatusBadge: Record<string, string> = { Pending: 'badge-warning', Confirmed: 'badge-info', Processing: 'badge-purple', 'Ready to Ship': 'badge-purple', Shipped: 'badge-info', Delivered: 'badge-success', Cancelled: 'badge-danger' };
const fmtDate = (value: unknown): string => {
  if (!value) return '—';
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'toDate' in (value as any)) { try { return (value as any).toDate().toLocaleString(); } catch { return '—'; } }
  return '—';
};
const addressText = (a?: any): string => {
  if (!a) return 'No delivery information';
  if (typeof a === 'string') return a || 'No delivery information';
  const parts = [a.street, a.city, a.state || a.province, a.zipCode || a.zip, a.country].filter(Boolean);
  return parts.length ? parts.join(', ') : 'No delivery information';
};

export default function Customers({ searchQuery }: { searchQuery: string }) {
  const [users, setUsers] = useState<FirestoreUser[]>([]);
  const [orders, setOrders] = useState<FirestoreOrder[]>([]);
  const [locations, setLocations] = useState<CustomerLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [modal, setModal] = useState<null | 'view'>(null);
  const [selected, setSelected] = useState<FirestoreUser | null>(null);
  const [sortBy, setSortBy] = useState('name');
  const [roleBusy, setRoleBusy] = useState('');

  useEffect(() => {
    let loaded = false;
    const done = () => { if (!loaded) { loaded = true; setLoading(false); } };
    const onErr = (label: string) => (err: unknown) => { console.error(`[UserManagement] ${label} error:`, err); setError(friendlyFirebaseError(err)); done(); };
    const u1 = subscribeUsersFromFirestore((rows) => { setUsers(rows as FirestoreUser[]); done(); setError(''); }, onErr('users'));
    const u2 = subscribeOrdersFromFirestore((rows) => setOrders(rows as FirestoreOrder[]), onErr('orders'));
    const u3 = subscribeCustomerLocationsFromFirestore((rows) => setLocations(rows as CustomerLocation[]), onErr('customer_locations'));
    return () => { u1(); u2(); u3(); };
  }, []);

  const locationByUser = useMemo(() => { const map = new Map<string, CustomerLocation>(); locations.forEach((l) => { if (l.userId) map.set(l.userId, l); if (l.id) map.set(l.id, l); }); return map; }, [locations]);
  const ordersByUser = useMemo(() => { const map = new Map<string, FirestoreOrder[]>(); orders.forEach((o) => { const key = String(o.customerId || ''); if (!key) return; (map.get(key) || map.set(key, []).get(key)!).push(o); }); return map; }, [orders]);
  const rows = useMemo(() => users.map((u) => {
    const uid = String(u.uid || u.id || '');
    const myOrders = ordersByUser.get(uid) || [];
    return { ...u, uid, name: String(u.fullName || u.email || uid || 'Unknown user'), email: String(u.email || ''), role: String(u.role || 'unknown'), joined: fmtDate(u.createdAt), orders: myOrders.length, totalSpent: myOrders.reduce((s, o) => s + Number(o.total || 0), 0), location: locationByUser.get(uid), avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(String(u.fullName || u.email || 'U'))}&background=6366f1&color=fff` };
  }), [users, ordersByUser, locationByUser]);
  const filtered = rows.filter((c) => {
    const q = searchQuery.toLowerCase();
    return (!q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.uid.toLowerCase().includes(q)) && (!filterRole || c.role === filterRole);
  }).sort((a, b) => sortBy === 'orders' ? b.orders - a.orders : sortBy === 'spent' ? b.totalSpent - a.totalSpent : sortBy === 'role' ? a.role.localeCompare(b.role) : a.name.localeCompare(b.name));

  const currentUid = firebaseAuth.currentUser?.uid || '';
  const selectedOrders = selected ? (ordersByUser.get(String(selected.uid || selected.id || '')) || []) : [];
  const selectedLocation = selected ? locationByUser.get(String(selected.uid || selected.id || '')) : undefined;

  const changeRole = async (user: any, role: 'admin' | 'customer' | 'guest') => {
    const uid = String(user.uid || user.id || '');
    if (!uid) return;
    if (uid === currentUid) { alert('You cannot change your own role.'); return; }
    if (!confirm(`Change role for ${user.email || uid} to "${role}"?`)) return;
    try { setRoleBusy(uid); await updateUserRoleInFirestore(uid, role); } catch (err) { alert(friendlyFirebaseError(err)); } finally { setRoleBusy(''); }
  };

  if (loading) return <div style={{ padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#c8d8f0' }}><div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div><div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600, fontSize: 16 }}>Loading users from Firestore…</div></div>;

  return (
    <div className="page-fade" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {error && <div style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {[{ label: 'Total Users', val: rows.length, color: '#4f8ef7' }, { label: 'Administrators', val: rows.filter(c => c.role === 'admin').length, color: '#ef4444' }, { label: 'Customers', val: rows.filter(c => c.role === 'customer').length, color: '#10b981' }, { label: 'Guests/Other', val: rows.filter(c => !['admin', 'customer'].includes(c.role)).length, color: '#8b5cf6' }].map(s => (
          <div key={s.label} className="admin-card" style={{ padding: '16px 20px' }}><div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 26, color: s.color, letterSpacing: '-0.02em' }}>{s.val}</div><div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#8b9fc8', marginTop: 3 }}>{s.label}</div></div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <select className="admin-input" style={{ width: 160 }} value={filterRole} onChange={e => setFilterRole(e.target.value)}><option value="">All Roles</option><option value="admin">Administrator</option><option value="customer">Customer</option><option value="guest">Guest</option></select>
        <select className="admin-input" style={{ width: 170 }} value={sortBy} onChange={e => setSortBy(e.target.value)}><option value="name">Sort: Name</option><option value="role">Sort: Role</option><option value="orders">Sort: Orders</option><option value="spent">Sort: Total Spent</option></select>
        <div style={{ flex: 1 }} /><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#4b5e82' }}>{filtered.length} users • Firestore: users/orders/customer_locations</span>
      </div>
      <div className="admin-card" style={{ overflow: 'hidden' }}><div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>User</th><th>Email</th><th>Role</th><th>Orders</th><th>Total Spent</th><th>Joined</th><th>Actions</th></tr></thead><tbody>
        {filtered.map(c => (
          <tr key={c.uid || c.id}>
            <td><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><img src={c.avatar} alt={c.name} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', background: '#1a2540', flexShrink: 0 }} /><div><div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 600, color: '#c8d8f0' }}>{c.name}</div><div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#4b5e82' }}>{c.uid}</div></div></div></td>
            <td><span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#8b9fc8' }}>{c.email || '—'}</span></td>
            <td><span className={'badge ' + (roleBadge[c.role] || 'badge-neutral')}>{c.role === 'admin' ? 'Administrator' : c.role}</span>{c.uid === currentUid && <span style={{ marginLeft: 6, fontSize: 10, color: '#f59e0b' }}>(you)</span>}</td>
            <td><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, color: '#4f8ef7' }}>{c.orders}</span></td>
            <td><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, color: c.totalSpent > 10000 ? '#10b981' : '#e2eaf8' }}>₱{c.totalSpent.toLocaleString()}</span></td>
            <td><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#4b5e82' }}>{c.joined}</span></td>
            <td><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn-secondary btn-sm" onClick={() => { setSelected(c as any); setModal('view'); }}>View</button>
              {c.uid !== currentUid && c.role !== 'admin' && <button className="btn-ghost btn-sm" disabled={roleBusy === c.uid} onClick={() => changeRole(c, 'admin')}>{roleBusy === c.uid ? '…' : 'Make Admin'}</button>}
              {c.uid !== currentUid && c.role === 'admin' && <button className="btn-ghost btn-sm" disabled={roleBusy === c.uid} onClick={() => changeRole(c, 'customer')}>{roleBusy === c.uid ? '…' : 'Make Customer'}</button>}
            </div></td>
          </tr>
        ))}
        {filtered.length === 0 && <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#6b7fa8', fontFamily: 'Inter, sans-serif' }}>No users found in Firestore <code>users</code> collection.</td></tr>}
      </tbody></table></div></div>

      {modal === 'view' && selected && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal-box" style={{ maxWidth: 720 }}>
            <div style={{ padding: '22px 28px 18px', borderBottom: '1px solid #1e2d4a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div><div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 18, color: '#e2eaf8' }}>{selected.fullName || selected.email || selected.uid || selected.id}</div><div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#6b7fa8' }}>{selected.email || '—'} • <span className={'badge ' + (roleBadge[String(selected.role || '')] || 'badge-neutral')}>{selected.role || 'unknown'}</span></div></div>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', color: '#4b5e82', cursor: 'pointer', fontSize: 20 }}>×</button>
            </div>
            <div style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 18, maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {[['UID', String(selected.uid || selected.id || '—')], ['Joined', fmtDate(selected.createdAt)], ['Role Updated', fmtDate(selected.roleUpdatedAt)]].map(([k, v]) => (<div key={k} style={{ background: '#0f1928', borderRadius: 8, padding: '10px 12px' }}><div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#4b5e82', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{k}</div><div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: '#c8d8f0', wordBreak: 'break-all' }}>{v}</div></div>))}
              </div>
              <div style={{ background: '#0f1928', borderRadius: 8, padding: '16px' }}><div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#4b5e82', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Delivery Information (Firestore: customer_locations)</div><div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#c8d8f0', lineHeight: 1.6 }}>{selectedLocation?.fullName || selected.fullName || '—'}<br />{selectedLocation?.phone || '—'}<br />{addressText(selectedLocation)}</div></div>
              <div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 700, color: '#e2eaf8', marginBottom: 12 }}>Order History (Firestore: orders, {selectedOrders.length})</div>
                {selectedOrders.length === 0 ? <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#4b5e82', padding: '20px', textAlign: 'center', background: '#0f1928', borderRadius: 10 }}>No orders found for this user.</div> : selectedOrders.map((o) => (
                  <div key={o.docId || o.id} style={{ padding: '12px 16px', background: '#0f1928', borderRadius: 10, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ flex: 1 }}><div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#4f8ef7', fontWeight: 600 }}>{o.id || o.docId}</div><div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#6b7fa8', marginTop: 2 }}>{(o.products || []).join(', ') || (o.items || []).map((i: any) => i?.product?.name || i?.name).filter(Boolean).join(', ') || '—'}</div><div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#3a4f72', marginTop: 2 }}>{fmtDate(o.createdAt || o.date)}</div></div>
                    <span className={'badge ' + (orderStatusBadge[String(o.orderStatus || o.status || 'Pending')] || 'badge-neutral')}>{o.orderStatus || o.status || 'Pending'}</span>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, color: '#4f8ef7' }}>₱{Number(o.total || 0).toLocaleString()}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: '#6b7fa8', lineHeight: 1.5 }}>Role changes are protected: you cannot change your own role here; only admins can update roles; Firestore rules also enforce admin-only user management and block role self-elevation.</div>
            </div>
            <div style={{ padding: '16px 28px', borderTop: '1px solid #1e2d4a', display: 'flex', gap: 10, justifyContent: 'flex-end' }}><button className="btn-ghost" onClick={() => setModal(null)}>Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
