import { useState } from 'react';

export default function Settings() {
  // Note: profile/store notification settings are currently local UI state (not persisted to Firestore). Migrate to a dedicated Firestore settings collection if needed.
  const [tab, setTab] = useState('profile');
  const [saved, setSaved] = useState(false);

  const [profile, setProfile] = useState({ name: 'Admin User', email: 'admin@techvault.ph', phone: '+63 917 000 0000', role: 'Super Admin', bio: 'System administrator for TechVault Computer and Gadgets.' });
  const [store, setStore] = useState({ storeName: 'TechVault Computer & Gadgets', email: 'support@techvault.ph', phone: '+63 917 888 9999', address: '123 Tech Hub, BGC, Taguig City, 1634', currency: 'PHP (₱)', timezone: 'Asia/Manila', lowStockThreshold: 5 });
  const [notifPrefs, setNotifPrefs] = useState({ emailOrders: true, emailPayments: true, emailStock: true, emailCustomers: false, pushOrders: true, pushPayments: true, pushStock: true, pushSystem: false });
  const [security, setSecurity] = useState({ currentPw: '', newPw: '', confirmPw: '', twoFactor: false, sessionTimeout: '30' });

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: '👤' },
    { id: 'store', label: 'Store', icon: '🏪' },
    { id: 'notifications', label: 'Notifications', icon: '🔔' },
    { id: 'security', label: 'Security', icon: '🔒' }
  ];

  const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <label className="form-label">{label}</label>
      {children}
    </div>
  );

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <button onClick={() => onChange(!checked)} style={{ position: 'relative', width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: checked ? '#4f8ef7' : '#1e2d4a', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: checked ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
    </button>
  );

  return (
    <div className="page-fade" style={{ padding: 24, display: 'flex', gap: 22 }}>
      {/* Sidebar tabs */}
      <div style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 9, border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: tab === t.id ? 600 : 400,
              background: tab === t.id ? 'rgba(79,142,247,0.12)' : 'transparent', color: tab === t.id ? '#4f8ef7' : '#6b7fa8', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 10 }}
            onMouseEnter={e => { if (tab !== t.id) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)'; } }}
            onMouseLeave={e => { if (tab !== t.id) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; } }}>
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Profile */}
        {tab === 'profile' && (
          <div className="admin-card" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 18, color: '#e2eaf8' }}>Profile Settings</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div style={{ width: 72, height: 72, borderRadius: 16, background: 'linear-gradient(135deg, #4f8ef7, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800, color: '#fff', fontFamily: 'Outfit, sans-serif' }}>A</div>
              <div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 20, fontWeight: 700, color: '#e2eaf8' }}>{profile.name}</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#4f8ef7' }}>{profile.role}</div>
                <button className="btn-secondary btn-sm" style={{ marginTop: 8 }}>Change Avatar</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <F label="Full Name"><input className="admin-input" value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} /></F>
              <F label="Email"><input className="admin-input" value={profile.email} onChange={e => setProfile({ ...profile, email: e.target.value })} /></F>
              <F label="Phone"><input className="admin-input" value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} /></F>
              <F label="Role">
                <input className="admin-input" value={profile.role} readOnly style={{ opacity: 0.6 }} />
              </F>
            </div>
            <F label="Bio"><textarea className="admin-input" value={profile.bio} onChange={e => setProfile({ ...profile, bio: e.target.value })} /></F>
          </div>
        )}

        {/* Store */}
        {tab === 'store' && (
          <div className="admin-card" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 18, color: '#e2eaf8' }}>Store Configuration</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <F label="Store Name"><input className="admin-input" value={store.storeName} onChange={e => setStore({ ...store, storeName: e.target.value })} /></F>
              <F label="Support Email"><input className="admin-input" value={store.email} onChange={e => setStore({ ...store, email: e.target.value })} /></F>
              <F label="Phone"><input className="admin-input" value={store.phone} onChange={e => setStore({ ...store, phone: e.target.value })} /></F>
              <F label="Currency">
                <select className="admin-input" value={store.currency} onChange={e => setStore({ ...store, currency: e.target.value })}>
                  <option>PHP (₱)</option>
                  <option>USD ($)</option>
                </select>
              </F>
              <F label="Timezone">
                <select className="admin-input" value={store.timezone} onChange={e => setStore({ ...store, timezone: e.target.value })}>
                  <option>Asia/Manila</option>
                  <option>Asia/Singapore</option>
                  <option>UTC</option>
                </select>
              </F>
              <F label="Low Stock Threshold"><input className="admin-input" type="number" value={store.lowStockThreshold} onChange={e => setStore({ ...store, lowStockThreshold: Number(e.target.value) })} /></F>
            </div>
            <F label="Store Address"><textarea className="admin-input" value={store.address} onChange={e => setStore({ ...store, address: e.target.value })} /></F>
          </div>
        )}

        {/* Notifications */}
        {tab === 'notifications' && (
          <div className="admin-card" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 18, color: '#e2eaf8' }}>Notification Preferences</div>
            {[
              { section: 'Email Notifications', items: [
                { key: 'emailOrders', label: 'New order placed', desc: 'Get notified when a customer places a new order' },
                { key: 'emailPayments', label: 'Payment submitted', desc: 'Get notified when payment proof is uploaded' },
                { key: 'emailStock', label: 'Low stock alert', desc: 'Get notified when product stock falls below minimum' },
                { key: 'emailCustomers', label: 'New customer signup', desc: 'Get notified when a new customer registers' }
              ]},
              { section: 'Push Notifications', items: [
                { key: 'pushOrders', label: 'Order updates', desc: 'Real-time push notifications for order status changes' },
                { key: 'pushPayments', label: 'Payment verification', desc: 'Instant alerts for pending payment verifications' },
                { key: 'pushStock', label: 'Stock alerts', desc: 'Push alerts for critical stock levels' },
                { key: 'pushSystem', label: 'System updates', desc: 'Notifications for system maintenance and backups' }
              ]}
            ].map(section => (
              <div key={section.section}>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 600, color: '#8b9fc8', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid #1e2d4a' }}>{section.section}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {section.items.map(item => (
                    <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 500, color: '#c8d8f0' }}>{item.label}</div>
                        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#4b5e82' }}>{item.desc}</div>
                      </div>
                      <Toggle checked={(notifPrefs as any)[item.key]} onChange={v => setNotifPrefs({ ...notifPrefs, [item.key]: v })} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Security */}
        {tab === 'security' && (
          <div className="admin-card" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 18, color: '#e2eaf8' }}>Security Settings</div>
            <div style={{ padding: '16px', background: '#0f1928', borderRadius: 10, border: '1px solid #1e2d4a' }}>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 700, color: '#e2eaf8', marginBottom: 14 }}>Change Password</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <F label="Current Password"><input className="admin-input" type="password" value={security.currentPw} onChange={e => setSecurity({ ...security, currentPw: e.target.value })} placeholder="Enter current password" /></F>
                <F label="New Password"><input className="admin-input" type="password" value={security.newPw} onChange={e => setSecurity({ ...security, newPw: e.target.value })} placeholder="Enter new password" /></F>
                <F label="Confirm New Password"><input className="admin-input" type="password" value={security.confirmPw} onChange={e => setSecurity({ ...security, confirmPw: e.target.value })} placeholder="Confirm new password" /></F>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: '#0f1928', borderRadius: 10, border: '1px solid #1e2d4a' }}>
              <div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 600, color: '#c8d8f0' }}>Two-Factor Authentication</div>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#4b5e82' }}>Add an extra layer of security to your account</div>
              </div>
              <Toggle checked={security.twoFactor} onChange={v => setSecurity({ ...security, twoFactor: v })} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: '#0f1928', borderRadius: 10, border: '1px solid #1e2d4a' }}>
              <div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 600, color: '#c8d8f0' }}>Session Timeout</div>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#4b5e82' }}>Automatically log out after inactivity</div>
              </div>
              <select className="admin-input" style={{ width: 130 }} value={security.sessionTimeout} onChange={e => setSecurity({ ...security, sessionTimeout: e.target.value })}>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="0">Never</option>
              </select>
            </div>
          </div>
        )}

        {/* Save */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-primary" onClick={handleSave}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Save Changes
          </button>
          <button className="btn-ghost">Discard</button>
          {saved && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#10b981' }}>✓ Changes saved</span>}
        </div>
      </div>
    </div>
  );
}
