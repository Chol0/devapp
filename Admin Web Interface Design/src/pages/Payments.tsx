import { useEffect, useState } from 'react';
import { payments as initialPayments, Payment, PaymentStatus } from '../data/mockData';
import { ORDER_SYNC_KEY, readSharedState, subscribeSharedState, writeSharedState } from '../store/sharedSync';
import { subscribeOrdersFromFirestore, updateOrderStatusInFirestore, friendlyFirebaseError } from '../store/firestoreSync';

const statusBadge: Record<string, string> = {
  'Paid': 'badge-success', 'Pending Verification': 'badge-warning', 'Rejected': 'badge-danger'
};

const normalizePaymentFromOrder = (order: any): (Payment & { docId?: string }) | null => {
  if (!order || typeof order !== 'object') return null;

  const status = order.paymentStatus === 'Paid' || order.paymentStatus === 'Verified'
    ? 'Paid'
    : order.paymentStatus === 'Rejected' || order.paymentStatus === 'Failed'
      ? 'Rejected'
      : 'Pending Verification';

  const amount = Number(order.total ?? 0);
  return {
    id: String(order.id ?? order.docId ?? `PAY-${Math.random().toString(16).slice(2, 8)}`),
    docId: String(order.docId ?? order.id ?? ''),
    orderId: String(order.id ?? order.docId ?? 'N/A'),
    customer: String(order.customer ?? order.address?.fullName ?? 'Customer'),
    amount,
    paymentMethod: String(order.paymentMethod ?? 'Cash on Delivery'),
    referenceNumber: String(order.paymentReference ?? order.paymentRef ?? 'N/A'),
    paymentProof: String(order.paymentProofUrl ?? 'https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=1200&q=80'),
    date: String(order.date ?? new Date().toISOString()),
    status,
  };
};

export default function Payments({ searchQuery }: { searchQuery: string }) {
  const [payments, setPayments] = useState<Payment[]>(() => {
    const shared = readSharedState<any[]>(ORDER_SYNC_KEY, []);
    const mapped = shared.map(normalizePaymentFromOrder).filter((value): value is Payment => Boolean(value));
    return mapped.length > 0 ? mapped : initialPayments;
  });
  const [modal, setModal] = useState<null | 'proof' | 'verify' | 'reject'>(null);
  const [selected, setSelected] = useState<Payment | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [rejectNote, setRejectNote] = useState('');

  const filtered = payments.filter(p => {
    const q = searchQuery.toLowerCase();
    const match = !q || p.orderId.toLowerCase().includes(q) || p.customer.toLowerCase().includes(q) || p.referenceNumber.toLowerCase().includes(q);
    const st = !filterStatus || p.status === filterStatus;
    return match && st;
  });

  useEffect(() => {
    const unsub = subscribeOrdersFromFirestore((orders) => {
      console.info(`[Payments] Firestore orders snapshot: ${orders.length}`);
      const mapped = orders.map(normalizePaymentFromOrder).filter((value): value is Payment => Boolean(value));
      setPayments(mapped);
      writeSharedState(ORDER_SYNC_KEY, orders);
    }, (err) => console.error('[Payments] Firestore orders error:', err));
    const unsubLocal = subscribeSharedState<any[]>(ORDER_SYNC_KEY, (next) => {
      if (Array.isArray(next)) setPayments(next.map(normalizePaymentFromOrder).filter((v): v is Payment => Boolean(v)));
    });
    return () => { unsub(); unsubLocal(); };  }, []);

  const updateStatus = async (payment: Payment & { docId?: string }, status: PaymentStatus, note = '') => {
    const paymentStatus = status === 'Paid' ? 'Paid' : status === 'Rejected' ? 'Rejected' : 'Pending Verification';
    const orderStatus = paymentStatus === 'Paid' ? 'Confirmed' : 'Pending';
    const docId = String((payment as any).docId || payment.orderId || payment.id || '').trim();
    if (!docId) {
      alert('Cannot verify payment: missing Firestore order/payment ID.');
      return;
    }
    const previous = payments;
    setPayments((cur) => cur.map((p) => (p.id === payment.id ? { ...p, status: paymentStatus } : p)));
    setModal(null);
    const noteToSave = note.trim();
    setRejectNote('');
    try {
      await updateOrderStatusInFirestore(docId, orderStatus, {
        paymentStatus,
        status: orderStatus,
        ...(paymentStatus === 'Rejected' && noteToSave ? { paymentNote: noteToSave } : {}),
        ...(paymentStatus === 'Paid' ? { paymentVerifiedAt: new Date().toISOString() } : {}),
      });
    } catch (err) {
      console.error('[Payments] Failed to save payment verification to Firestore:', err);
      setPayments(previous);
      alert(friendlyFirebaseError(err));
    }
  };

  const pending = payments.filter(p => p.status === 'Pending Verification').length;
  const verified = payments.filter(p => p.status === 'Paid').length;
  const rejected = payments.filter(p => p.status === 'Rejected').length;
  const totalVerified = payments.filter(p => p.status === 'Paid').reduce((s, p) => s + p.amount, 0);

  return (
    <div className="page-fade" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {[
          { label: 'Pending Verification', val: pending, color: '#f59e0b' },
          { label: 'Verified Payments', val: verified, color: '#10b981' },
          { label: 'Rejected Payments', val: rejected, color: '#ef4444' },
          { label: 'Total Verified', val: '₱' + totalVerified.toLocaleString(), color: '#4f8ef7' }
        ].map(s => (
          <div key={s.label} className="admin-card" style={{ padding: '16px 20px' }}>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 26, color: s.color, letterSpacing: '-0.02em' }}>{s.val}</div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#8b9fc8', marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <select className="admin-input" style={{ width: 200 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Status</option>
          <option>Pending Verification</option>
          <option>Paid</option>
          <option>Rejected</option>
        </select>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#4b5e82' }}>{filtered.length} payments</span>
      </div>

      {/* Table */}
      <div className="admin-card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Payment ID</th>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Reference No.</th>
                <th>Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id}>
                  <td><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#6b7fa8' }}>{p.id}</span></td>
                  <td><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#4f8ef7', fontWeight: 600 }}>{p.orderId}</span></td>
                  <td><span style={{ fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 600, color: '#c8d8f0' }}>{p.customer}</span></td>
                  <td><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, color: '#e2eaf8' }}>₱{p.amount.toLocaleString()}</span></td>
                  <td><span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#8b9fc8' }}>{p.paymentMethod}</span></td>
                  <td><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#6b7fa8' }}>{p.referenceNumber}</span></td>
                  <td><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#4b5e82' }}>{p.date}</span></td>
                  <td><span className={'badge ' + statusBadge[p.status]}>{p.status}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn-secondary btn-sm" onClick={() => { setSelected(p); setModal('proof'); }} style={{ transition: 'all 0.15s' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  Proof
                </button>
                      {p.status === 'Pending Verification' && (
                        <>
                          <button className="btn-success btn-sm" onClick={() => { setSelected(p); setModal('verify'); }}>Verify</button>
                          <button className="btn-danger btn-sm" onClick={() => { setSelected(p); setModal('reject'); }}>Reject</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Proof Modal */}
      {modal === 'proof' && selected && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal-box" style={{ maxWidth: 560, animation: 'fadeIn 0.2s ease' }}>
            <div style={{ padding: '22px 28px 18px', borderBottom: '1px solid #1e2d4a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 18, color: '#e2eaf8' }}>Payment Proof</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#4b5e82' }}>{selected.orderId} — {selected.customer}</div>
              </div>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', color: '#4b5e82', cursor: 'pointer', transition: 'color 0.15s' }} onMouseOver={e => (e.currentTarget.style.color = '#e2eaf8')} onMouseOut={e => (e.currentTarget.style.color = '#4b5e82')}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[['Amount', '₱' + selected.amount.toLocaleString()], ['Method', selected.paymentMethod], ['Reference', selected.referenceNumber], ['Date', selected.date]].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#4b5e82', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{k}</div>
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, color: '#c8d8f0' }}>{v}</div>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#4b5e82', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Payment Screenshot</div>
                <img src={selected.paymentProof} alt="Payment proof" style={{ width: '100%', borderRadius: 10, border: '1px solid #1e2d4a', objectFit: 'cover', maxHeight: 240 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#6b7fa8' }}>Status:</span>
                <span className={'badge ' + statusBadge[selected.status]}>{selected.status}</span>
              </div>
            </div>
              <div style={{ padding: '16px 28px', borderTop: '1px solid #1e2d4a', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn-ghost" onClick={() => setModal(null)}>Close</button>
                {selected.status === 'Pending Verification' && (
                  <>
                    <button className="btn-danger" onClick={() => { setModal('reject'); }}>Reject</button>
                    <button className="btn-success" onClick={() => updateStatus(selected as any, 'Paid')}>Verify Payment</button>
                  </>
                )}
              </div>
          </div>
        </div>
      )}

      {/* Verify Modal */}
      {modal === 'verify' && selected && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal-box" style={{ maxWidth: 420 }}>
            <div style={{ padding: '28px', textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#10b981' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 18, color: '#e2eaf8', marginBottom: 8 }}>Verify Payment?</div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: '#6b7fa8', marginBottom: 6 }}>
                Confirm payment of <strong style={{ color: '#4f8ef7' }}>₱{selected.amount.toLocaleString()}</strong> from <strong style={{ color: '#c8d8f0' }}>{selected.customer}</strong>?
              </div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#4b5e82', marginBottom: 24 }}>Ref: {selected.referenceNumber}</div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button className="btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                <button className="btn-success" onClick={() => updateStatus(selected as any, 'Paid')}>Verify Payment</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {modal === 'reject' && selected && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal-box" style={{ maxWidth: 420 }}>
            <div style={{ padding: '22px 28px 18px', borderBottom: '1px solid #1e2d4a' }}>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 18, color: '#e2eaf8' }}>Reject Payment</div>
            </div>
            <div style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: '#8b9fc8' }}>
                Rejecting payment from <strong style={{ color: '#c8d8f0' }}>{selected.customer}</strong> for ₱{selected.amount.toLocaleString()}.
              </div>
              <div>
                <label className="form-label">Rejection Reason</label>
                <textarea className="admin-input" value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="Explain why this payment is being rejected..." style={{ minHeight: 90 }} />
              </div>
            </div>
            <div style={{ padding: '16px 28px', borderTop: '1px solid #1e2d4a', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn-danger" onClick={() => updateStatus(selected as any, 'Rejected', rejectNote)}>Reject Payment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
