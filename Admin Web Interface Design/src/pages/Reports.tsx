import { useEffect, useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { subscribeProductsFromFirestore, subscribeOrdersFromFirestore, friendlyFirebaseError } from '../store/firestoreSync';

const periods = ['Daily', 'Weekly', 'Monthly', 'Yearly'];
const reportTypes = ['Sales', 'Orders', 'Products', 'Inventory', 'Payments', 'Customers'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) return (
    <div style={{ background: '#141e33', border: '1px solid #1e2d4a', borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600, color: '#e2eaf8', marginBottom: 4 }}>{label}</div>
      {payload.map((x: any) => <div key={x.name} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: x.color }}>{x.name}: {x.name === 'sales' ? 'PHP ' + Number(x.value || 0).toLocaleString() : x.value}</div>)}
    </div>
  );
  return null;
};

export default function Reports() {
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('Monthly');
  const [reportType, setReportType] = useState('Sales');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    const u1 = subscribeProductsFromFirestore((rows) => setProducts(Array.isArray(rows) ? rows : []), (e) => setError(friendlyFirebaseError(e)));
    const u2 = subscribeOrdersFromFirestore((rows) => setOrders(Array.isArray(rows) ? rows : []), (e) => setError(friendlyFirebaseError(e)));
    return () => { u1(); u2(); };
  }, []);

  const chartData = useMemo(() => {
    const labels = period === 'Daily' ? ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] : period === 'Yearly' ? ['2023','2024','2025','2026'] : period === 'Weekly' ? ['W1','W2','W3','W4','W5'] : ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const buckets = labels.map((month) => ({ month, sales: 0, orders: 0 }));
    orders.forEach((o, idx) => { const b = buckets[idx % buckets.length]; b.sales += Number(o.total || 0); b.orders += 1; });
    return buckets;
  }, [orders, period]);

  const totalSales = orders.reduce((s, o) => s + Number(o.total || 0), 0);
  const avgOrder = orders.length ? Math.round(totalSales / orders.length) : 0;
  const categoryDataTyped = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach((p: any) => { const k = String(p.category || 'Other'); map.set(k, (map.get(k) || 0) + 1); });
    const colors = ['#4f8ef7','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4'];
    return Array.from(map.entries()).map(([name, value], i) => ({ name, value, color: colors[i % colors.length] }));
  }, [products]);
  const bestSellersData = useMemo(() => products.slice(0, 5).map((p: any) => ({ product: String(p.name || 'Product'), sold: Math.max(1, Math.round(Number(p.stock || 1))) })), [products]);

  return (
    <div className="page-fade" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {error && <div style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>{error}</div>}
      <div className="admin-card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6 }}>{periods.map(p => (<button key={p} onClick={() => setPeriod(p)} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid', cursor: 'pointer', fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 600, background: period === p ? '#4f8ef7' : '#0f1928', borderColor: period === p ? '#4f8ef7' : '#1e2d4a', color: period === p ? '#fff' : '#6b7fa8' }}>{p}</button>))}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{reportTypes.map(r => (<button key={r} onClick={() => setReportType(r)} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid', cursor: 'pointer', fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 600, background: reportType === r ? 'rgba(79,142,247,0.12)' : 'transparent', borderColor: reportType === r ? '#4f8ef7' : '#1e2d4a', color: reportType === r ? '#4f8ef7' : '#6b7fa8' }}>{r}</button>))}</div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="date" className="admin-input" style={{ width: 140 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} /><span style={{ color: '#4b5e82', fontFamily: 'Inter, sans-serif', fontSize: 13 }}>to</span><input type="date" className="admin-input" style={{ width: 140 }} value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {[{ label: 'Sales (derived)', val: 'PHP ' + totalSales.toLocaleString(), color: '#4f8ef7' }, { label: 'Orders', val: String(orders.length), color: '#10b981' }, { label: 'Avg Order', val: 'PHP ' + avgOrder.toLocaleString(), color: '#8b5cf6' }, { label: 'Products', val: String(products.length), color: '#f59e0b' }].map(s => (<div key={s.label} className="admin-card" style={{ padding: '16px 20px' }}><div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 22, color: s.color }}>{s.val}</div><div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#8b9fc8', marginTop: 3 }}>{s.label}</div></div>))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
        <div className="admin-card" style={{ padding: 20 }}><div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 16, color: '#e2eaf8', marginBottom: 12 }}>{reportType} Trend (Firestore-derived)</div><div style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#1e2d4a" /><XAxis dataKey="month" stroke="#4b5e82" /><YAxis stroke="#4b5e82" /><Tooltip content={<CustomTooltip />} /><Area type="monotone" dataKey="sales" stroke="#4f8ef7" fill="#4f8ef733" name="sales" /><Area type="monotone" dataKey="orders" stroke="#10b981" fill="#10b98133" name="orders" /></AreaChart></ResponsiveContainer></div></div>
        <div className="admin-card" style={{ padding: 20 }}><div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 16, color: '#e2eaf8', marginBottom: 12 }}>Product Categories</div><div style={{ height: 220 }}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryDataTyped} dataKey="value" nameKey="name" outerRadius={80}>{categoryDataTyped.map((c) => <Cell key={c.name} fill={c.color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div></div>
      </div>
      <div className="admin-card" style={{ padding: 20 }}><div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 16, color: '#e2eaf8', marginBottom: 12 }}>Top Products (Firestore product)</div><div style={{ display: 'grid', gap: 8 }}>{bestSellersData.map((b) => (<div key={b.product} style={{ display: 'flex', justifyContent: 'space-between', background: '#0f1928', borderRadius: 8, padding: '10px 12px' }}><span style={{ color: '#c8d8f0' }}>{b.product}</span><span style={{ color: '#4f8ef7', fontFamily: 'JetBrains Mono, monospace' }}>stock/ref {b.sold}</span></div>))}{bestSellersData.length === 0 && <div style={{ color: '#6b7fa8' }}>No products found.</div>}</div></div>
      <div style={{ fontSize: 12, color: '#6b7fa8' }}>Reports read Firestore <code>product</code>/<code>orders</code>. Some chart buckets are client-derived; validate before production use. Date filters are UI-ready but not yet applied to Firestore queries.</div>
    </div>
  );
}
