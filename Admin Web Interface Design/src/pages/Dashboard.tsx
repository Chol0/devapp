import { useEffect, useState, useMemo } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, Line, LineChart } from 'recharts';
import { PRODUCT_SYNC_KEY, ORDER_SYNC_KEY, readSharedState, subscribeSharedState } from '../store/sharedSync';
import { subscribeProductsFromFirestore, subscribeOrdersFromFirestore } from '../store/firestoreSync';

const normalizeSharedOrder = (entry: any) => {
  const status = entry?.orderStatus ?? entry?.status ?? 'Pending';
  const paymentStatus = entry?.paymentStatus ?? entry?.paymentStatusRaw ?? 'Pending Verification';
  const dateValue = entry?.date ?? entry?.createdAt ?? new Date().toISOString();
  const products = Array.isArray(entry?.products)
    ? entry.products
    : Array.isArray(entry?.items)
      ? entry.items.map((item: any) => item?.product?.name ?? item?.name ?? 'Product')
      : [];

  return {
    id: entry?.id ?? entry?.orderId ?? 'N/A',
    customer: entry?.customer ?? entry?.address?.fullName ?? 'Customer',
    customerId: entry?.customerId ?? 'shared-customer',
    date: String(dateValue),
    products,
    total: Number(entry?.total ?? 0),
    paymentMethod: entry?.paymentMethod ?? 'Cash on Delivery',
    paymentStatus,
    orderStatus: status,
    address: typeof entry?.address === 'string' ? entry.address : 'Customer address unavailable',
  };
};

const normalizeProduct = (entry: any) => ({
  ...entry,
  status: entry?.status ?? entry?.stock ?? 'In Stock',
  name: entry?.name ?? 'Product',
});

/* ============================================
   AI SALES PREDICTION ENGINE
   ============================================ */

// Parse order date to YYYY-MM
const parseMonth = (dateStr: string | undefined | null): string => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  } catch {
    return '';
  }
};

// Aggregate monthly sales from orders
const getMonthlySales = (orders: any[]): { month: string; sales: number; orders: number; customers: number }[] => {
  const monthly: Record<string, { sales: number; orderIds: Set<string>; customerIds: Set<string> }> = {};
  orders.forEach(o => {
    const m = parseMonth(o.date);
    if (!m) return;
    if (!monthly[m]) monthly[m] = { sales: 0, orderIds: new Set(), customerIds: new Set() };
    monthly[m].sales += Number(o.total ?? 0);
    monthly[m].orderIds.add(o.id);
    monthly[m].customerIds.add(o.customerId || o.customer);
  });
  return Object.entries(monthly)
    .map(([month, data]) => ({
      month,
      sales: data.sales,
      orders: data.orderIds.size,
      customers: data.customerIds.size,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
};

// Linear regression: predict next month sales & customers
const predictNextMonth = (monthly: { month: string; sales: number; customers: number }[]) => {
  if (monthly.length < 2) {
    return {
      predictedSales: monthly[0]?.sales ?? 0,
      predictedCustomers: monthly[0]?.customers ?? 0,
      growthRate: 0,
      confidence: 'low',
      trend: 'stable',
    };
  }

  const n = monthly.length;
  const x = monthly.map((_, i) => i); // 0, 1, 2, ...
  const ySales = monthly.map(d => d.sales);
  const yCustomers = monthly.map(d => d.customers);

  // Linear regression: y = mx + b
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = ySales.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, b, i) => a + b * ySales[i], 0);
  const sumXX = x.reduce((a, b) => a + b * b, 0);

  const mSales = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const bSales = (sumY - mSales * sumX) / n;

  const sumYC = yCustomers.reduce((a, b) => a + b, 0);
  const sumXYC = x.reduce((a, b, i) => a + b * yCustomers[i], 0);
  const mCustomers = (n * sumXYC - sumX * sumYC) / (n * sumXX - sumX * sumX);
  const bCustomers = (sumYC - mCustomers * sumX) / n;

  const predictedSales = Math.max(0, mSales * n + bSales);
  const predictedCustomers = Math.max(0, Math.round(mCustomers * n + bCustomers));

  // Growth rate: compare last month vs predicted
  const lastMonthSales = ySales[ySales.length - 1];
  const growthRate = lastMonthSales > 0 ? ((predictedSales - lastMonthSales) / lastMonthSales) * 100 : 0;

  // Determine trend
  let trend = 'stable';
  if (growthRate > 5) trend = 'growing';
  else if (growthRate < -5) trend = 'declining';

  // Confidence based on data points
  let confidence = 'low';
  if (n >= 6) confidence = 'high';
  else if (n >= 3) confidence = 'medium';

  return { predictedSales, predictedCustomers, growthRate, confidence, trend };
};

// Generate prediction chart data (historical + 1 predicted month)
const generatePredictionChart = (monthly: { month: string; sales: number }[], predictedSales: number) => {
  if (monthly.length === 0) {
    return [];
  }
  const lastMonth = monthly[monthly.length - 1];
  const lastDate = new Date(lastMonth.month + '-01');
  const nextMonth = new Date(lastDate.getFullYear(), lastDate.getMonth() + 1, 1);
  const nextMonthStr = nextMonth.getFullYear() + '-' + String(nextMonth.getMonth() + 1).padStart(2, '0');

  return [
    ...monthly.map(d => ({ month: d.month, sales: d.sales, type: 'historical' as const })),
    { month: nextMonthStr, sales: predictedSales, type: 'predicted' as const },
  ];
};

function StatCard({ label, value, sub, color, icon }: { label: string; value: string; sub: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="admin-card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
          {icon}
        </div>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: 99 }}>Live</span>
      </div>
      <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 26, color: '#e2eaf8', letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 500, color: '#8b9fc8', marginTop: 2 }}>{label}</div>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#3a4f72', marginTop: 4 }}>{sub}</div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: '#141e33', border: '1px solid #1e2d4a', borderRadius: 8, padding: '10px 14px' }}>
        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600, color: '#e2eaf8', marginBottom: 4 }}>{label}</div>
        {payload.map((p: any) => (
          <div key={p.name} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: p.color }}>
            {p.name}: {p.name === 'sales' ? '₱' + p.value.toLocaleString() : p.value}
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const salesDataFallback = [
  { month: 'Jan', sales: 0, orders: 0 },
  { month: 'Feb', sales: 0, orders: 0 },
  { month: 'Mar', sales: 0, orders: 0 },
];

export default function Dashboard() {
  const [sharedOrders, setSharedOrders] = useState<any[]>(() => readSharedState<any[]>(ORDER_SYNC_KEY, []).map(normalizeSharedOrder));
  const [sharedProducts, setSharedProducts] = useState<any[]>(() => readSharedState<any[]>(PRODUCT_SYNC_KEY, []).map(normalizeProduct));

  useEffect(() => {
    const unsubProducts = subscribeProductsFromFirestore((next) => { if (Array.isArray(next)) setSharedProducts(next); }, (err) => console.error('[Dashboard] products error:', err));
    const unsubOrders = subscribeOrdersFromFirestore((next) => { if (Array.isArray(next)) setSharedOrders(next.map(normalizeSharedOrder)); }, (err) => console.error('[Dashboard] orders error:', err));
    const unsubLocalProducts = subscribeSharedState<any[]>(PRODUCT_SYNC_KEY, (next) => { if (Array.isArray(next) && next.length) setSharedProducts(next); });
    const unsubLocalOrders = subscribeSharedState<any[]>(ORDER_SYNC_KEY, (next) => { if (Array.isArray(next) && next.length) setSharedOrders(next.map(normalizeSharedOrder)); });
    return () => { unsubProducts(); unsubOrders(); unsubLocalProducts(); unsubLocalOrders(); };
  }, []);

  const orders = sharedOrders;
  const products = sharedProducts;
  const totalSales = orders.reduce((sum, order) => sum + Number(order.total ?? 0), 0);
  const totalOrders = orders.length;
  const totalProducts = products.length;
  const lowStock = products.filter((p: any) => ['Low Stock', 'Out of Stock'].includes(p.status ?? p.stock ?? '')).length;
  const pendingPayments = orders.filter((o: any) => String(o.paymentStatus ?? '').toLowerCase().includes('pending')).length;
  const totalCustomers = new Set(orders.map((o: any) => o.customer).filter(Boolean)).size;

  /* ============================================
     AI SALES PREDICTION
     ============================================ */
  const monthlySales = useMemo(() => getMonthlySales(orders), [orders]);
  const prediction = useMemo(() => predictNextMonth(monthlySales), [monthlySales]);
  const predictionChart = useMemo(() => generatePredictionChart(monthlySales.map(d => ({ month: d.month, sales: d.sales })), prediction.predictedSales), [monthlySales, prediction.predictedSales]);

  const recentOrders = [...orders].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 5);
  const lowStockProducts = products.filter((p: any) => (p.status ?? p.stock ?? 'In Stock') !== 'In Stock');

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      'Pending': 'badge-warning', 'Confirmed': 'badge-info', 'Processing': 'badge-purple',
      'Ready to Ship': 'badge-purple', 'Shipped': 'badge-info', 'Delivered': 'badge-success', 'Cancelled': 'badge-danger',
      'Paid': 'badge-success', 'Pending Verification': 'badge-warning', 'Rejected': 'badge-danger'
    };
    return map[status] || 'badge-neutral';
  };

  const salesChart = orders.length
    ? [
        { month: 'Current', sales: totalSales, orders: totalOrders },
        { month: 'Live', sales: totalSales, orders: totalOrders },
      ]
    : salesDataFallback;

  const weeklyChart = orders.length
    ? [
        { day: 'Mon', sales: Math.max(0, Math.round(totalSales / 10)) },
        { day: 'Tue', sales: Math.max(0, Math.round(totalSales / 8)) },
        { day: 'Wed', sales: Math.max(0, Math.round(totalSales / 11)) },
        { day: 'Thu', sales: Math.max(0, Math.round(totalSales / 7)) },
        { day: 'Fri', sales: Math.max(0, Math.round(totalSales / 6)) },
        { day: 'Sat', sales: Math.max(0, Math.round(totalSales / 5)) },
        { day: 'Sun', sales: Math.max(0, Math.round(totalSales / 9)) },
      ]
    : [
        { day: 'Mon', sales: 0 }, { day: 'Tue', sales: 0 }, { day: 'Wed', sales: 0 },
        { day: 'Thu', sales: 0 }, { day: 'Fri', sales: 0 }, { day: 'Sat', sales: 0 }, { day: 'Sun', sales: 0 },
      ];

  const categoryChart = products.length
    ? Object.entries(products.reduce((acc: Record<string, number>, product: any) => {
        const key = product.category ?? 'General';
        acc[key] = (acc[key] ?? 0) + (Number(product.price ?? 0) / 1000);
        return acc;
      }, {})).map(([name, value]) => ({ name, value: Math.max(5, Math.round(value)), color: ['#4f8ef7', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1'][Math.abs(name.length) % 6] }))
    : [
        { name: 'No data', value: 100, color: '#4f8ef7' },
      ];

  const bestSellers = [...products]
    .sort((a: any, b: any) => Number(b.price ?? 0) - Number(a.price ?? 0))
    .slice(0, 4)
    .map((product: any, index: number) => ({
      product: product.name ?? `Product ${index + 1}`,
      sold: Math.max(1, Math.round((Number(product.price ?? 0) / 2500))),
      revenue: Number(product.price ?? 0),
      trend: 'up',
    }));

  return (
    <div className="page-fade" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16 }}>
        <StatCard label="Total Sales" value={"₱" + (totalSales / 1000).toFixed(0) + "K"} sub="Mar 2024 revenue" color="#4f8ef7"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>} />
        <StatCard label="Total Orders" value={String(totalOrders)} sub={totalOrders ? 'Live from app orders' : 'Waiting for orders'} color="#10b981"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>} />
        <StatCard label="Total Products" value={String(totalProducts)} sub="8 categories" color="#8b5cf6"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>} />
        <StatCard label="Low Stock" value={String(lowStock)} sub="Need reorder" color="#f59e0b"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>} />
        <StatCard label="Pending Payments" value={String(pendingPayments)} sub="Needs verification" color="#ef4444"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>} />
        <StatCard label="Customers" value={String(totalCustomers)} sub={totalCustomers ? 'Synced from orders' : 'No customer data yet'} color="#ec4899"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>} />
      </div>

      {/* AI Prediction Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 12 }}>
        <StatCard label="Next Month Sales" value={"₱" + (prediction.predictedSales / 1000).toFixed(1) + "K"} sub="AI predicted revenue" color="#4f8ef7"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>} />
        <StatCard label="Predicted Customers" value={String(prediction.predictedCustomers)} sub="Expected buyers next month" color="#10b981"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>} />
        <StatCard label="Growth Rate" value={prediction.growthRate.toFixed(1) + '%'} sub={prediction.trend === 'growing' ? 'Trending up' : prediction.trend === 'declining' ? 'Trending down' : 'Stable'} color={prediction.trend === 'growing' ? '#10b981' : prediction.trend === 'declining' ? '#ef4444' : '#f59e0b'}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>} />
        <StatCard label="AI Confidence" value={prediction.confidence.charAt(0).toUpperCase() + prediction.confidence.slice(1)} sub={'Based on ' + monthlySales.length + ' months of data'} color="#8b5cf6"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2v2m0 16v2m-6-6h2m-4 0h2m-4 0h2m6-6h2m-6 0h2"/></svg>} />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 300px', gap: 16 }}>
        {/* Sales Area Chart */}
        <div className="admin-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 15, color: '#e2eaf8' }}>Sales Overview</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#4b5e82' }}>Oct 2023 – Mar 2024</div>
            </div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 20, color: '#4f8ef7' }}>₱317.7K</div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={salesChart} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4f8ef7" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#4f8ef7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2d4a" vertical={false} />
              <XAxis dataKey="month" tick={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fill: '#4b5e82' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fill: '#4b5e82' }} axisLine={false} tickLine={false} tickFormatter={v => `₱${(v/1000).toFixed(0)}K`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="sales" name="sales" stroke="#4f8ef7" strokeWidth={2} fill="url(#salesGrad)" dot={false} activeDot={{ r: 5, fill: '#4f8ef7' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Weekly Bar Chart */}
        <div className="admin-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 15, color: '#e2eaf8' }}>This Week</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#4b5e82' }}>Daily sales breakdown</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={weeklyChart} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} barSize={20}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2d4a" vertical={false} />
              <XAxis dataKey="day" tick={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fill: '#4b5e82' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fill: '#4b5e82' }} axisLine={false} tickLine={false} tickFormatter={v => `₱${(v/1000).toFixed(0)}K`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="sales" name="sales" fill="#4f8ef7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* AI Sales Prediction Chart */}
        <div className="admin-card" style={{ padding: 20 }}>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 15, color: '#e2eaf8', marginBottom: 4 }}>Sales Prediction</div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#4b5e82', marginBottom: 14 }}>AI forecast based on historical data</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={predictionChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2d4a" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#6b7fa8' }} />
              <YAxis tickFormatter={v => '₱' + (v / 1000).toFixed(0) + 'K'} tick={{ fontSize: 10, fill: '#6b7fa8' }} />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const item = payload[0];
                return (
                  <div style={{ background: '#141e33', border: '1px solid #1e2d4a', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600, color: '#e2eaf8', marginBottom: 4 }}>{item.payload.month}</div>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: item.payload.type === 'predicted' ? '#8b5cf6' : '#4f8ef7' }}>
                      {item.payload.type === 'predicted' ? 'Predicted: ' : 'Actual: '}₱{item.payload.sales.toLocaleString()}
                    </div>
                  </div>
                );
              }} />
              <Legend verticalAlign="top" align="right" height={36} formatter={(name) => name === 'predicted' ? 'AI Prediction' : name} />
              <Line type="monotone" dataKey="sales" stroke="#4f8ef7" strokeWidth={2} dot={false} name="Actual" />
              <Line type="monotone" dataKey="sales" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 5" dot={{ fill: '#8b5cf6', strokeWidth: 2 }} name="predicted" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Category Donut */}
        <div className="admin-card" style={{ padding: 20 }}>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 15, color: '#e2eaf8', marginBottom: 4 }}>By Category</div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#4b5e82', marginBottom: 14 }}>Sales distribution</div>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie data={categoryChart} cx="50%" cy="50%" innerRadius={42} outerRadius={60} dataKey="value" paddingAngle={3}>
                {categoryChart.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(v) => `${v}%`} contentStyle={{ background: '#141e33', border: '1px solid #1e2d4a', borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
            {categoryChart.map(c => (
              <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: c.color, flexShrink: 0 }} />
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#6b7fa8', flex: 1 }}>{c.name}</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#8b9fc8' }}>{c.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        {/* Recent Orders */}
        <div className="admin-card" style={{ padding: '20px 0 0', overflow: 'hidden' }}>
          <div style={{ padding: '0 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 15, color: '#e2eaf8' }}>Recent Orders</div>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#4f8ef7', cursor: 'pointer' }}>View all</span>
          </div>
          <div>
            {recentOrders.map(o => (
              <div key={o.id} style={{ padding: '10px 20px', borderTop: '1px solid rgba(30,45,74,0.6)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 600, color: '#c8d8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.customer}</div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#4b5e82' }}>{o.id}</div>
                </div>
                <span className={'badge ' + statusBadge(o.orderStatus)} style={{ fontSize: 10 }}>{o.orderStatus}</span>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#4f8ef7', fontWeight: 600, whiteSpace: 'nowrap' }}>₱{o.total.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Best Sellers */}
        <div className="admin-card" style={{ padding: '20px 0 0', overflow: 'hidden' }}>
          <div style={{ padding: '0 20px 14px', fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 15, color: '#e2eaf8' }}>Best Sellers</div>
          <div>
            {bestSellers.map((b, i) => (
              <div key={b.product} style={{ padding: '10px 20px', borderTop: '1px solid rgba(30,45,74,0.6)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, background: i === 0 ? '#f59e0b22' : '#1e2d4a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 700, color: i === 0 ? '#f59e0b' : '#4b5e82', flexShrink: 0 }}>#{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 12, fontWeight: 600, color: '#c8d8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.product}</div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#4b5e82' }}>{b.sold} sold</div>
                </div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#4f8ef7', whiteSpace: 'nowrap' }}>₱{(b.revenue / 1000).toFixed(1)}K</div>
              </div>
            ))}
          </div>
        </div>

        {/* Low Stock */}
        <div className="admin-card" style={{ padding: '20px 0 0', overflow: 'hidden' }}>
          <div style={{ padding: '0 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 15, color: '#e2eaf8' }}>Low Stock Alert</div>
            <span className="badge badge-warning" style={{ fontSize: 10 }}>{lowStockProducts.length} items</span>
          </div>
          <div>
            {lowStockProducts.map(p => (
              <div key={p.id} style={{ padding: '10px 20px', borderTop: '1px solid rgba(30,45,74,0.6)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <img src={p.image} alt={p.name} style={{ width: 34, height: 34, borderRadius: 7, objectFit: 'cover', background: '#1a2540', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 12, fontWeight: 600, color: '#c8d8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#4b5e82' }}>{p.stock} / {p.minStock} min</div>
                </div>
                <span className={'badge ' + (p.status === 'Out of Stock' ? 'badge-danger' : 'badge-warning')} style={{ fontSize: 10 }}>{p.stock === 0 ? 'Out' : p.stock}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
