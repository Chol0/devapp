import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Categories from './pages/Categories';
import Promotions from './pages/Promotions';
import Reviews from './pages/Reviews';
import Orders from './pages/Orders';
import Payments from './pages/Payments';
import Customers from './pages/Customers';
import Reports from './pages/Reports';
import Notifications from './pages/Notifications';
import ChatbotManagement from './pages/ChatbotManagement';
import Settings from './pages/Settings';
import { loadSharedStateFromFirebase, ORDER_SYNC_KEY, PRODUCT_SYNC_KEY, CUSTOMER_SYNC_KEY } from './store/sharedSync';
import { subscribeAuth, signInAdminWithEmail, signOutFirebaseAuth, getCurrentUserRole, ensureUserProfile, friendlyFirebaseError } from './store/firestoreSync';

type Page = 'dashboard' | 'products' | 'categories' | 'promotions' | 'reviews' | 'orders' | 'payments' | 'customers' | 'reports' | 'notifications' | 'chatbot' | 'settings';

function hydrateFromFirebase(key: string, value: unknown) {
  if (typeof window === 'undefined' || !Array.isArray(value)) return;

  localStorage.setItem(key, JSON.stringify({ key, value, updatedAt: new Date().toISOString() }));
  window.dispatchEvent(new CustomEvent('nextech-sync', { detail: { key, value } }));
}

function LoginGate({ deniedMessage, onClearDenied }: { deniedMessage?: string; onClearDenied?: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const handleLogin = async () => {
    try {
      setBusy(true);
      setError('');
      setInfo('');
      onClearDenied?.();
      if (!email.trim() || !password) {
        setError('Email and password are required.');
        return;
      }
      const user = await signInAdminWithEmail(email.trim(), password, mode);
      const role = await getCurrentUserRole(user.uid);
      if (role !== 'admin') {
        const deniedEmail = user.email || email.trim();
        await signOutFirebaseAuth();
        setError(`Access denied for ${deniedEmail}. This portal is for admin accounts only. Ask an administrator to set users/${user.uid}.role to "admin" in Firebase Console (Firestore rules block self-elevation).`);
        return;
      }
      // Auth state listener will grant access after role is confirmed.
    } catch (err) {
      setError(friendlyFirebaseError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'radial-gradient(circle at top, #122033 0%, #0b1120 48%, #070d18 100%)', color: '#edf2ff' }}>
      <div style={{ width: '100%', maxWidth: 420, background: 'rgba(9, 14, 24, 0.9)', border: '1px solid rgba(145, 170, 210, 0.2)', borderRadius: 20, boxShadow: '0 30px 80px rgba(2,6,23,0.7)', padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#7dd3fc' }}>Firebase Auth + Firestore</div>
          <div style={{ display: 'inline-flex', borderRadius: 999, background: '#0d1729', border: '1px solid rgba(148,163,184,0.22)', padding: 4 }}>
            <button onClick={() => setMode('login')} style={{ border: 'none', borderRadius: 999, padding: '8px 12px', background: mode === 'login' ? 'linear-gradient(135deg, #4f8ef7, #7c3aed)' : 'transparent', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Login</button>
            <button onClick={() => setMode('signup')} style={{ border: 'none', borderRadius: 999, padding: '8px 12px', background: mode === 'signup' ? 'linear-gradient(135deg, #4f8ef7, #7c3aed)' : 'transparent', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Create</button>
          </div>
        </div>

        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800 }}>{mode === 'login' ? 'Admin Portal' : 'Create account'}</h1>
        <p style={{ color: '#a6b6d6', margin: '12px 0 20px' }}>Admin access only. New accounts are created with the <b>customer</b> role and cannot access this portal until an administrator sets <code style={{ color: '#7dd3fc' }}>users/&#123;uid&#125;.role = "admin"</code> in Firebase Console. Client accounts created in the mobile app cannot access admin.</p>

        <label style={{ display: 'block', marginBottom: 12, fontSize: 13, color: '#dfe9ff' }}>Email</label>
        <input value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid #1f2e4a', background: '#0d1729', color: '#edf2ff', marginBottom: 16 }} placeholder="admin@example.com" />

        <label style={{ display: 'block', marginBottom: 12, fontSize: 13, color: '#dfe9ff' }}>Password</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid #1f2e4a', background: '#0d1729', color: '#edf2ff', marginBottom: 20 }} placeholder="••••••••" />

        {deniedMessage && <div style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 12px', marginBottom: 16, fontSize: 13 }}>{deniedMessage}</div>}
        {info && <div style={{ background: 'rgba(245,158,11,0.12)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, padding: '10px 12px', marginBottom: 16, fontSize: 13 }}>{info}</div>}
        {error && <div style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 12px', marginBottom: 16 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 12, flexDirection: 'column' }}>
          <button disabled={busy} onClick={handleLogin} style={{ height: 48, border: 'none', borderRadius: 12, background: 'linear-gradient(135deg, #4f8ef7, #7c3aed)', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Please wait...' : mode === 'login' ? 'Sign in with Firebase' : 'Create Firebase account'}
          </button>
          <div style={{ fontSize: 12, color: '#8b9fc8', lineHeight: 1.5 }}>Role-based access is enforced. Firestore rules must be published in Firebase Console for full protection.</div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [authReady, setAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [deniedMessage, setDeniedMessage] = useState('');

  useEffect(() => {
    let active = true;
    const unsub = subscribeAuth(async (user) => {
      if (!user) {
        if (!active) return;
        setIsAdmin(false);
        setAuthReady(true);
        return;
      }
      try { await ensureUserProfile(user); } catch { /* profile sync is best-effort */ }
      const role = await getCurrentUserRole(user.uid);
      if (!active) return;
      if (role === 'admin') {
        setDeniedMessage('');
        setIsAdmin(true);
        setAuthReady(true);
        return;
      }
      // Enforce role-based access: client/customer accounts cannot access the admin portal.
      const email = user.email || 'this account';
      setIsAdmin(false);
      setDeniedMessage(`Access denied for ${email}. Client/customer accounts can only use the mobile app. Admin access requires users/${user.uid}.role = "admin" in Firestore (set manually in Firebase Console).`);
      setAuthReady(true);
      try { await signOutFirebaseAuth(); } catch { /* ignore sign-out errors */ }
    });
    return () => { active = false; unsub(); };
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

    const syncFirebaseState = async () => {
      // Best-effort legacy hydration for non-migrated pages (RTDB path is legacy)
      const productCatalog = await loadSharedStateFromFirebase(PRODUCT_SYNC_KEY, []);
      hydrateFromFirebase(PRODUCT_SYNC_KEY, productCatalog);
      const orderCatalog = await loadSharedStateFromFirebase(ORDER_SYNC_KEY, []);
      hydrateFromFirebase(ORDER_SYNC_KEY, orderCatalog);
      const customerCatalog = await loadSharedStateFromFirebase(CUSTOMER_SYNC_KEY, []);
      hydrateFromFirebase(CUSTOMER_SYNC_KEY, customerCatalog);
    };

    void syncFirebaseState();
  }, [isAdmin]);

  const navigate = (page: string) => {
    setCurrentPage(page as Page);
    setSearchQuery('');
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <Dashboard />;
      case 'products': return <Products searchQuery={searchQuery} />;
      case 'categories': return <Categories searchQuery={searchQuery} />;
      case 'promotions': return <Promotions />;
      case 'reviews': return <Reviews />;
      case 'orders': return <Orders searchQuery={searchQuery} />;
      case 'payments': return <Payments searchQuery={searchQuery} />;
      case 'customers': return <Customers searchQuery={searchQuery} />;
      case 'reports': return <Reports />;
      case 'notifications': return <Notifications />;
      case 'chatbot': return <ChatbotManagement />;
      case 'settings': return <Settings />;
      default: return <Dashboard />;
    }
  };

  if (!authReady) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0b1120', color: '#c8d8f0' }}>Checking Firebase session…</div>;
  }

  if (!isAdmin) {
    return <LoginGate deniedMessage={deniedMessage} onClearDenied={() => setDeniedMessage('')} />;
  }

  return (
    <div style={{ display: 'flex', height: '100%', background: '#0b1120', fontFamily: 'Inter, sans-serif', overflow: 'hidden' }}>
      <Sidebar currentPage={currentPage} onNavigate={navigate} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <Header currentPage={currentPage} onNavigate={navigate} searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        <main style={{ flex: 1, overflowY: 'auto' }}>
          {renderPage()}
        </main>
      </div>
    </div>
  );
}
