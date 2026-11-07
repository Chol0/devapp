import { useEffect, useState } from 'react';
import { subscribeReviews, deleteReview, friendlyFirebaseError } from '../store/firestoreSync';

export default function Reviews() {
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useEffect(() => subscribeReviews(setRows, (e) => setError(friendlyFirebaseError(e))), []);

  const del = async (id: string) => {
    setBusy(id); setError('');
    try { await deleteReview(id); } catch (e) { setError(friendlyFirebaseError(e)); } finally { setBusy(''); }
  };

  return (
    <div className="page-fade" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#4b5e82' }}>{rows.length} reviews (Firestore: reviews)</span>
      </div>
      {error && <div style={{ color: '#fca5a5', fontSize: 13 }}>{error}</div>}
      <div className="admin-card" style={{ overflow: 'hidden' }}>
        <table className="data-table"><thead><tr><th>Product</th><th>Customer</th><th>Rating</th><th>Comment</th><th>Date</th><th>Action</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.id}>
              <td style={{ color: '#c8d8f0', fontWeight: 600 }}>{String(r.productName || r.productId || 'Product')}</td>
              <td style={{ color: '#8b9fc8' }}>{String(r.userName || r.userEmail || r.userId || 'Customer')}</td>
              <td style={{ color: '#f59e0b' }}>{'★'.repeat(Math.max(0, Math.min(5, Number(r.rating)||0)))}{'☆'.repeat(5 - Math.max(0, Math.min(5, Number(r.rating)||0)))}</td>
              <td style={{ color: '#a8bde0', maxWidth: 360 }}>{String(r.comment || r.text || '')}</td>
              <td style={{ color: '#6b7fa8', fontSize: 12 }}>{String(r.createdAt || r.date || '')}</td>
              <td><button className="btn-danger btn-sm" disabled={busy===r.id} onClick={() => del(r.id)}>{busy===r.id ? '…' : 'Delete'}</button></td>
            </tr>
          ))}{!rows.length && <tr><td colSpan={6} style={{ padding: 24, color: '#6b7fa8' }}>No reviews yet. Customers submit reviews from the mobile app; Firestore creates the <code>reviews</code> collection automatically.</td></tr>}</tbody></table>
      </div>
    </div>
  );
}
