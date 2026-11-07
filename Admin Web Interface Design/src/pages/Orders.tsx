import { useEffect, useState } from 'react';
import { orders as initialOrders, Order, OrderStatus, PaymentStatus } from '../data/mockData';
import { ORDER_SYNC_KEY, readSharedState, subscribeSharedState, writeSharedState } from '../store/sharedSync';
import { subscribeOrdersFromFirestore, updateOrderStatusInFirestore, friendlyFirebaseError, createNotification } from '../store/firestoreSync';

const orderStatuses: OrderStatus[] = ['Pending', 'Confirmed', 'Processing', 'Ready to Ship', 'Shipped', 'Delivered', 'Cancelled'];

const statusBadgeClass: Record<string, string> = {
  'Pending': 'badge-warning', 'Confirmed': 'badge-info', 'Processing': 'badge-purple',
  'Ready to Ship': 'badge-purple', 'Shipped': 'badge-info', 'Delivered': 'badge-success', 'Cancelled': 'badge-danger'
};
const paymentBadge: Record<string, string> = {
  'Paid': 'badge-success', 'Pending Verification': 'badge-warning', 'Rejected': 'badge-danger',
  'Verified': 'badge-success', 'Failed': 'badge-danger'
};

const normalizePaymentStatus = (value?: string): PaymentStatus => {
  switch (value) {
    case 'Verified':
    case 'Paid':
      return 'Paid';
    case 'Failed':
    case 'Rejected':
      return 'Rejected';
    case 'Pending Verification':
      return 'Pending Verification';
    default:
      return 'Pending Verification';
  }
};

const normalizeOrderStatus = (value?: string): OrderStatus => {
  switch (value) {
    case 'Pending':
    case 'Confirmed':
    case 'Processing':
    case 'Ready to Ship':
    case 'Shipped':
    case 'Delivered':
    case 'Cancelled':
      return value;
    default:
      return 'Pending';
  }
};

const extractAddressText = (address: unknown): string => {
  if (typeof address === 'string') return address;
  if (address && typeof address === 'object') {
    const candidate = address as { street?: string; city?: string; province?: string; zip?: string; fullName?: string };
    const parts = [candidate.street, candidate.city, candidate.province, candidate.zip ? `ZIP ${candidate.zip}` : ''];
    return parts.filter(Boolean).join(', ');
  }
  return 'Customer address unavailable';
};

const normalizeIncomingOrder = (incoming: any): Order & { docId?: string } => {
  const status = normalizeOrderStatus(incoming?.orderStatus ?? incoming?.status ?? 'Pending');
  const paymentStatus = normalizePaymentStatus(incoming?.paymentStatus ?? 'Pending Verification');
  const productNames = Array.isArray(incoming?.products)
    ? incoming.products
    : Array.isArray(incoming?.items)
      ? incoming.items.map((item: any) => item?.product?.name ?? item?.name ?? 'Product')
      : ['Product'];

  return {
    docId: incoming?.docId ?? incoming?.id,
    id: incoming?.id ?? incoming?.orderId ?? incoming?.docId ?? 'N/A',
    customer: incoming?.customer ?? incoming?.address?.fullName ?? 'Customer',
    customerId: incoming?.customerId ?? 'C-Shared',
    date: incoming?.date ?? incoming?.createdAt ?? 'N/A',
    products: productNames,
    total: Number(incoming?.total ?? 0),
    paymentMethod: incoming?.paymentMethod ?? 'Cash on Delivery',
    paymentStatus,
    orderStatus: status,
    address: extractAddressText(incoming?.address),
  } as any;
};

const toSharedOrder = (order: Order) => ({
  id: order.id,
  status: order.orderStatus,
  orderStatus: order.orderStatus,
  total: order.total,
  paymentMethod: order.paymentMethod,
  paymentStatus: order.paymentStatus === 'Paid' ? 'Verified' : order.paymentStatus === 'Rejected' ? 'Failed' : order.paymentStatus,
  address: {
    fullName: order.customer,
    phone: '',
    street: order.address.split(',')[0]?.trim() ?? order.address,
    city: order.address.split(',')[1]?.trim() ?? '',
    province: order.address.split(',')[2]?.trim() ?? '',
    zip: '',
  },
  createdAt: order.date,
  items: [],
  customer: order.customer,
  date: order.date,
  products: order.products,
  customerId: order.customerId,
  paymentStatusRaw: order.paymentStatus,
});

export default function Orders({ searchQuery }: { searchQuery: string }) {
  const [orders, setOrders] = useState<Order[]>(() => readSharedState<any[]>(ORDER_SYNC_KEY, initialOrders).map(normalizeIncomingOrder));

  useEffect(() => {
    const apply = (next: any[]) => {
      if (!Array.isArray(next)) return;
      console.info(`[Orders] Firestore snapshot: ${next.length} order(s)`);
      setOrders(next.map(normalizeIncomingOrder));
      writeSharedState(ORDER_SYNC_KEY, next);
    };
    const unsub = subscribeOrdersFromFirestore(apply, (err) => console.error('[Orders] Firestore orders error:', err));
    const unsubLocal = subscribeSharedState<any[]>(ORDER_SYNC_KEY, (next) => { if (Array.isArray(next) && next.length) setOrders(next.map(normalizeIncomingOrder)); });
    return () => { unsub(); unsubLocal(); };
  }, []);

  const [filterStatus, setFilterStatus] = useState('');
  const [filterPayment, setFilterPayment] = useState('');
  const [modal, setModal] = useState<null | 'view' | 'status'>(null);
  const [selected, setSelected] = useState<Order | null>(null);
  const [newStatus, setNewStatus] = useState<OrderStatus>('Pending');

  const filtered = orders.filter(o => {
    const q = searchQuery.toLowerCase();
    const match = !q || o.id.toLowerCase().includes(q) || o.customer.toLowerCase().includes(q);
    const st = !filterStatus || o.orderStatus === filterStatus;
    const pay = !filterPayment || o.paymentStatus === filterPayment;
    return match && st && pay;
  });

  const openView = (o: Order) => { setSelected(o); setModal('view'); };
  const openStatus = (o: Order) => { setSelected(o); setNewStatus(o.orderStatus); setModal('status'); };

  const applyStatus = async () => {
    if (!selected) return;
    const previous = orders;
    const nextOrders = orders.map(o =>
      o.id === selected.id ? { ...o, orderStatus: newStatus, status: newStatus } : o,
    );
    setOrders(nextOrders);
    writeSharedState(ORDER_SYNC_KEY, nextOrders.map(toSharedOrder));
    setModal(null);
    try {
      await updateOrderStatusInFirestore((selected as any).docId || selected.id, newStatus);
      if ((selected as any).customerId) {
        await createNotification({ userId: (selected as any).customerId, type: 'order', orderId: selected.id, title: 'Order status updated', message: `Your order ${selected.id} is now: ${newStatus}.` }).catch((e) => console.warn('[Orders] notification create failed:', e));
      }
    } catch (err) {
      console.error('[Orders] Failed to update Firestore order status:', err);
      setOrders(previous);
      alert(friendlyFirebaseError(err));
    }
  };

  const statusFlowIndex = (s: OrderStatus) => orderStatuses.indexOf(s);

  return (
    <div className="page-fade" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Status summary pills */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {orderStatuses.map(s => {
          const count = orders.filter(o => o.orderStatus === s).length;
          return (
            <button key={s} onClick={() => setFilterStatus(filterStatus === s ? '' : s)}
              style={{ padding: '6px 14px', borderRadius: 99, border: '1px solid', cursor: 'pointer', fontFamily: 'Outfit, sans-serif', fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
                background: filterStatus === s ? 'rgba(79,142,247,0.15)' : '#0f1928',
                borderColor: filterStatus === s ? '#4f8ef7' : '#1e2d4a',
                color: filterStatus === s ? '#4f8ef7' : '#6b7fa8' }}>
              {s} <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>({count})</span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <select className="admin-input" style={{ width: 180 }} value={filterPayment} onChange={e => setFilterPayment(e.target.value)}>
          <option value="">All Payment Status</option>
          <option>Paid</option>
          <option>Pending Verification</option>
          <option>Rejected</option>
        </select>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#4b5e82' }}>{filtered.length} orders</span>
      </div>

      {/* Table */}
      <div className="admin-card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Products</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Pay Status</th>
                <th>Order Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o.id}>
                  <td><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#4f8ef7', fontWeight: 600 }}>{o.id}</span></td>
                  <td>
                    <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 600, color: '#c8d8f0' }}>{o.customer}</div>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#4b5e82' }}>{o.address.split(',')[1]?.trim()}</div>
                  </td>
                  <td><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#6b7fa8' }}>{o.date}</span></td>
                  <td>
                    <div style={{ maxWidth: 180 }}>
                      {o.products.map(p => <div key={p} style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#8b9fc8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p}</div>)}
                    </div>
                  </td>
                  <td><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, color: '#e2eaf8' }}>₱{o.total.toLocaleString()}</span></td>
                  <td><span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#8b9fc8' }}>{o.paymentMethod}</span></td>
                  <td><span className={'badge ' + paymentBadge[o.paymentStatus]}>{o.paymentStatus}</span></td>
                  <td><span className={'badge ' + statusBadgeClass[o.orderStatus]}>{o.orderStatus}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn-secondary btn-sm" onClick={() => openView(o)}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        View
                      </button>
                      <button className="btn-ghost btn-sm" onClick={() => openStatus(o)}>Update</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Modal */}
      {modal === 'view' && selected && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal-box" style={{ maxWidth: 580 }}>
            <div style={{ padding: '22px 28px 18px', borderBottom: '1px solid #1e2d4a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 18, color: '#e2eaf8' }}>Order Details</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#4f8ef7' }}>{selected.id}</div>
              </div>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', color: '#4b5e82', cursor: 'pointer' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Status badges */}
              <div style={{ display: 'flex', gap: 8 }}>
                <span className={'badge ' + statusBadgeClass[selected.orderStatus]}>{selected.orderStatus}</span>
                <span className={'badge ' + paymentBadge[selected.paymentStatus]}>{selected.paymentStatus}</span>
              </div>

              {/* Order flow */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto' }}>
                {orderStatuses.filter(s => s !== 'Cancelled').map((s, i) => {
                  const curIdx = statusFlowIndex(selected.orderStatus);
                  const thisIdx = statusFlowIndex(s);
                  const done = curIdx >= thisIdx && selected.orderStatus !== 'Cancelled';
                  const active = s === selected.orderStatus;
                  return (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: done ? '#4f8ef7' : '#1e2d4a', border: active ? '2px solid #4f8ef7' : '2px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        </div>
                        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, color: done ? '#4f8ef7' : '#3a4f72', textAlign: 'center', whiteSpace: 'nowrap' }}>{s}</div>
                      </div>
                      {i < 5 && <div style={{ flex: 1, height: 2, background: done && statusFlowIndex(selected.orderStatus) > thisIdx ? '#4f8ef7' : '#1e2d4a', margin: '0 2px', marginBottom: 16 }} />}
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[['Customer', selected.customer], ['Date', selected.date], ['Payment Method', selected.paymentMethod], ['Address', selected.address]].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#4b5e82', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{k}</div>
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#c8d8f0' }}>{v}</div>
                  </div>
                ))}
              </div>

              <div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#4b5e82', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Products Ordered</div>
                {selected.products.map(p => (
                  <div key={p} style={{ padding: '8px 12px', background: '#0f1928', borderRadius: 8, marginBottom: 6, fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#c8d8f0' }}>{p}</div>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#0f1928', borderRadius: 10 }}>
                <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 600, color: '#8b9fc8' }}>Order Total</span>
                <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 800, color: '#4f8ef7' }}>₱{selected.total.toLocaleString()}</span>
              </div>
            </div>
            <div style={{ padding: '16px 28px', borderTop: '1px solid #1e2d4a', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setModal(null)}>Close</button>
              <button className="btn-primary" onClick={() => openStatus(selected)}>Update Status</button>
            </div>
          </div>
        </div>
      )}

      {/* Status Update Modal */}
      {modal === 'status' && selected && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal-box" style={{ maxWidth: 440 }}>
            <div style={{ padding: '22px 28px 18px', borderBottom: '1px solid #1e2d4a' }}>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 18, color: '#e2eaf8' }}>Update Order Status</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#4f8ef7' }}>{selected.id} — {selected.customer}</div>
            </div>
            <div style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {orderStatuses.map(s => (
                <button key={s} onClick={() => setNewStatus(s)}
                  style={{ padding: '11px 16px', borderRadius: 9, border: '1px solid', cursor: 'pointer', background: newStatus === s ? 'rgba(79,142,247,0.12)' : '#0f1928', borderColor: newStatus === s ? '#4f8ef7' : '#1e2d4a', color: newStatus === s ? '#4f8ef7' : '#6b7fa8', fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 600, textAlign: 'left', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${newStatus === s ? '#4f8ef7' : '#1e2d4a'}`, background: newStatus === s ? '#4f8ef7' : 'transparent', flexShrink: 0 }} />
                  {s}
                </button>
              ))}
            </div>
            <div style={{ padding: '16px 28px', borderTop: '1px solid #1e2d4a', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn-primary" onClick={applyStatus}>Apply Status</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
