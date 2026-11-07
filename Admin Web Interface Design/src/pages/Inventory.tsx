import { useEffect, useMemo, useState } from 'react';
import { subscribeProductsFromFirestore, friendlyFirebaseError } from '../store/firestoreSync';

export default function Inventory({ searchQuery }: { searchQuery: string }) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    const unsub = subscribeProductsFromFirestore(
      (rows) => { setProducts(Array.isArray(rows) ? rows : []); setLoading(false); setError(''); },
      (err) => { console.error('[Inventory] Firestore product error:', err); setError(friendlyFirebaseError(err)); setLoading(false); },
    );
    return unsub;
  }, []);

  const normalized = useMemo(() => products.map((p: any) => {
    const stock = Number(p.stock ?? p.quantity ?? 0);
    const minStock = Number(p.minStock ?? p.min_stock ?? 5);
    const status = stock <= 0 ? 'Out of Stock' : stock <= minStock ? 'Low Stock' : 'In Stock';
    return { ...p, stock, minStock, status, name: String(p.name || ''), sku: String(p.sku || p.id || '-'), category: String(p.category || '-') };
  }), [products]);

  const filtered = normalized.filter(p => {
    const q = searchQuery.toLowerCase();
    const match = !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
    return match && (!filterStatus || p.status === filterStatus);
  });

  const inStock = normalized.filter(p => p.status === 'In Stock').length;
  const lowStock = normalized.filter(p => p.status === 'Low Stock').length;
  const outOfStock = normalized.filter(p => p.status === 'Out of Stock').length;
  const statusColor = (status: string) => status === 'In Stock' ? '#10b981' : status === 'Low Stock' ? '#f59e0b' : '#ef4444';
  const stockPercent = (current: number, max: number) => Math.min((current / Math.max(max * 3, 1)) * 100, 100);

  if (loading) return <div style={{ padding: 40, color: '#c8d8f0' }}>Loading inventory from Firestore product collection...</div>;

  return (
    <div className="page-fade" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {error && <div style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {[{ label: 'In Stock', count: inStock, color: '#10b981' }, { label: 'Low Stock', count: lowStock, color: '#f59e0b' }, { label: 'Out of Stock', count: outOfStock, color: '#ef4444' }].map(s => (
          <div key={s.label} className="admin-card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: 11, background: s.color + '18' }} />
            <div><div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 28, color: '#e2eaf8', lineHeight: 1 }}>{s.count}</div><div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#8b9fc8', marginTop: 2 }}>{s.label}</div></div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <select className="admin-input" style={{ width: 160 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}><option value="">All Status</option><option>In Stock</option><option>Low Stock</option><option>Out of Stock</option></select>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#4b5e82' }}>{filtered.length} products - Firestore: product</span>
      </div>
      <div className="admin-card" style={{ overflow: 'hidden' }}><div style={{ overflowX: 'auto' }}>
        <table className="data-table"><thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Stock</th><th>Min</th><th>Status</th></tr></thead><tbody>
          {filtered.map((p) => (
            <tr key={p.id || p.sku}>
              <td><span style={{ fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 600, color: '#c8d8f0' }}>{p.name}</span></td>
              <td><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#6b7fa8' }}>{p.sku}</span></td>
              <td><span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#8b9fc8' }}>{p.category}</span></td>
              <td><div style={{ minWidth: 120 }}><div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: statusColor(p.status), fontWeight: 700 }}>{p.stock}</div><div style={{ height: 5, background: '#0f1928', borderRadius: 999, marginTop: 4, overflow: 'hidden' }}><div style={{ height: '100%', width: `${stockPercent(p.stock, p.minStock)}%`, background: statusColor(p.status), borderRadius: 999 }} /></div></div></td>
              <td><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#6b7fa8' }}>{p.minStock}</span></td>
              <td><span className={'badge ' + (p.status === 'In Stock' ? 'badge-success' : p.status === 'Low Stock' ? 'badge-warning' : 'badge-danger')}>{p.status}</span></td>
            </tr>
          ))}
          {filtered.length === 0 && <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: '#6b7fa8' }}>No products found in Firestore product collection.</td></tr>}
        </tbody></table>
      </div></div>
    </div>
  );
}
