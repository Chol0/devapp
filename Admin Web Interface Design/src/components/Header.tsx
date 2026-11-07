import { useState } from 'react';
import { notifications } from '../data/mockData';

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Overview of your store performance' },
  products: { title: 'Products', subtitle: 'Manage your product catalog' },
  categories: { title: 'Categories', subtitle: 'Organize products by category' },
  inventory: { title: 'Inventory', subtitle: 'Track stock levels and availability' },
  orders: { title: 'Orders', subtitle: 'Manage customer orders' },
  payments: { title: 'Payment Verification', subtitle: 'Review and verify payment submissions' },
  customers: { title: 'Customers', subtitle: 'Manage customer accounts' },
  reports: { title: 'Reports & Analytics', subtitle: 'Data insights and performance metrics' },
  notifications: { title: 'Notifications', subtitle: 'Stay updated on store activities' },
  chatbot: { title: 'AI Chatbot', subtitle: 'Manage assistant configuration, store info, FAQs, and delivery guidance' },
  settings: { title: 'Settings', subtitle: 'Configure your admin preferences' }
};

interface HeaderProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export default function Header({ currentPage, onNavigate, searchQuery, onSearchChange }: HeaderProps) {
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const unread = notifications.filter(n => !n.read);
  const info = pageTitles[currentPage] || { title: currentPage, subtitle: '' };

  const notifTypeColor: Record<string, string> = {
    order: '#4f8ef7', payment: '#f59e0b', stock: '#ef4444', customer: '#10b981', system: '#8b5cf6'
  };

  return (
    <header style={{ height: 64, background: '#0a1222', borderBottom: '1px solid #0e1928', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 16, flexShrink: 0 }}>
      {/* Title */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 18, color: '#e2eaf8', letterSpacing: '-0.01em', lineHeight: 1 }}>{info.title}</div>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#4b5e82', marginTop: 2 }}>{info.subtitle}</div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', width: 280 }}>
        <svg style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#4b5e82' }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          style={{ paddingLeft: 34, paddingRight: 14, paddingTop: 8, paddingBottom: 8, background: '#0f1928', border: '1px solid #0e1928', borderRadius: 8, color: '#e2eaf8', fontSize: 13, fontFamily: 'Inter, sans-serif', width: '100%', outline: 'none' }}
          onFocus={e => { e.currentTarget.style.borderColor = '#4f8ef7'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(79,142,247,0.12)'; }}
          onBlur={e => { e.currentTarget.style.borderColor = '#0e1928'; e.currentTarget.style.boxShadow = 'none'; }}
        />
      </div>

      {/* Notification bell */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setShowNotifDropdown(v => !v)}
          style={{ width: 38, height: 38, borderRadius: 9, background: '#0f1928', border: '1px solid #0e1928', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7fa8', position: 'relative', transition: 'all 0.15s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#141e33'; (e.currentTarget as HTMLButtonElement).style.color = '#4f8ef7'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#0f1928'; (e.currentTarget as HTMLButtonElement).style.color = '#6b7fa8'; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          {unread.length > 0 && (
            <span style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: '50%', background: '#ef4444', border: '2px solid #0a1222' }} />
          )}
        </button>

        {showNotifDropdown && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowNotifDropdown(false)} />
            <div style={{ position: 'absolute', top: 46, right: 0, width: 340, background: '#111827', border: '1px solid #1e2d4a', borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.5)', zIndex: 100, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #1e2d4a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 600, fontSize: 14, color: '#e2eaf8' }}>Notifications</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#4f8ef7', cursor: 'pointer' }} onClick={() => { onNavigate('notifications'); setShowNotifDropdown(false); }}>View all</span>
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {notifications.slice(0, 5).map(n => (
                  <div key={n.id} style={{ padding: '11px 16px', borderBottom: '1px solid rgba(30,45,74,0.5)', background: n.read ? 'transparent' : 'rgba(79,142,247,0.04)', display: 'flex', gap: 10, cursor: 'pointer' }}
                    onClick={() => { onNavigate('notifications'); setShowNotifDropdown(false); }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: notifTypeColor[n.type], marginTop: 5, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 600, color: n.read ? '#8b9fc8' : '#c8d8f0' }}>{n.title}</div>
                      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#4b5e82', marginTop: 1 }}>{n.message}</div>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#3a4f72', marginTop: 3 }}>{n.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Date */}
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#3a4f72', whiteSpace: 'nowrap' }}>
        {new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
      </div>
    </header>
  );
}
