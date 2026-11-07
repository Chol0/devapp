// DEPRECATION: Legacy local/RTDB bridge kept only for non-critical cross-page cache during Firestore migration.
// Primary business data should use src/store/firestoreSync.ts (Cloud Firestore). Do not add new RTDB dependencies.
export const PRODUCT_SYNC_KEY = 'nextech-product-catalog-v1';
export const ORDER_SYNC_KEY = 'nextech-order-sync-v1';
export const CUSTOMER_SYNC_KEY = 'nextech-customer-location-v1';
export const FIREBASE_API_KEY = 'AIzaSyCligP6ePhaa3GP5BGMn4I0PLnrEjwDT7s';
export const FIREBASE_DATABASE_URL = 'https://product-inventory-app-fdbc7-default-rtdb.firebaseio.com';
export const FIREBASE_AUTH_KEY = 'nextech-firebase-auth';
const CHANNEL_NAME = 'nextech-sync-channel';

interface FirebaseAuthState {
  idToken: string;
  localId: string;
  refreshToken: string;
  email?: string;
}

function resolveWindow() {
  if (typeof window === 'undefined') return null;
  return window;
}

export function getStoredFirebaseAuth(): FirebaseAuthState | null {
  const root = resolveWindow();
  if (!root) return null;

  try {
    const raw = root.localStorage.getItem(FIREBASE_AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as FirebaseAuthState;
  } catch {
    return null;
  }
}

export function setStoredFirebaseAuth(auth: FirebaseAuthState | null) {
  const root = resolveWindow();
  if (!root) return;

  if (!auth) {
    root.localStorage.removeItem(FIREBASE_AUTH_KEY);
    return;
  }

  root.localStorage.setItem(FIREBASE_AUTH_KEY, JSON.stringify(auth));
}

function createFallbackAuth(email: string): FirebaseAuthState {
  const normalizedEmail = email.trim() || 'guest@demo.local';
  const isAdmin = normalizedEmail.toLowerCase().includes('admin');

  return {
    idToken: `demo-${isAdmin ? 'admin' : 'guest'}-token`,
    localId: isAdmin ? 'admin-demo-user' : 'guest-user',
    refreshToken: `demo-${isAdmin ? 'admin' : 'guest'}-refresh-token`,
    email: normalizedEmail,
  };
}

export async function signInToFirebase(options?: { email?: string; password?: string }) {
  const payload = options?.email && options?.password
    ? { email: options.email, password: options.password, returnSecureToken: true }
    : { returnSecureToken: true };

  const endpoint = options?.email && options?.password
    ? 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='
    : 'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=';

  try {
    const response = await fetch(`${endpoint}${FIREBASE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const fallback = createFallbackAuth(options?.email ?? 'guest@demo.local');
      setStoredFirebaseAuth(fallback);
      return fallback;
    }

    const data = await response.json() as FirebaseAuthState & { expiresIn?: string; email?: string };
    const auth = {
      idToken: data.idToken,
      localId: data.localId,
      refreshToken: data.refreshToken,
      email: data.email ?? options?.email ?? 'guest@local.demo',
    };
    setStoredFirebaseAuth(auth);
    return auth;
  } catch {
    const fallback = createFallbackAuth(options?.email ?? 'guest@demo.local');
    setStoredFirebaseAuth(fallback);
    return fallback;
  }
}

export async function signOutFromFirebase() {
  setStoredFirebaseAuth(null);
}

function buildFirebasePath(key: string) {
  return `${FIREBASE_DATABASE_URL}/shared/${encodeURIComponent(key)}.json`;
}

export async function loadSharedStateFromFirebase<T>(key: string, fallback: T): Promise<T> {
  const auth = getStoredFirebaseAuth();
  if (!auth?.idToken || auth.idToken.startsWith('demo-')) return fallback;

  try {
    const response = await fetch(`${buildFirebasePath(key)}?auth=${encodeURIComponent(auth.idToken)}`);
    if (!response.ok) return fallback;

    const body = await response.json();
    if (body === null || body === undefined) return fallback;
    if (typeof body === 'object' && 'value' in body) return (body as { value: T }).value ?? fallback;
    return body as T;
  } catch {
    return fallback;
  }
}

export async function saveSharedStateToFirebase<T>(key: string, value: T) {
  const auth = getStoredFirebaseAuth();
  if (!auth?.idToken || auth.idToken.startsWith('demo-')) return;

  try {
    await fetch(`${buildFirebasePath(key)}?auth=${encodeURIComponent(auth.idToken)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value, updatedAt: new Date().toISOString() }),
    });
  } catch {
    // ignore Firebase sync failures and continue with local state
  }
}

export function readSharedState<T>(key: string, fallback: T): T {
  const root = resolveWindow();
  if (!root) return fallback;

  try {
    const raw = root.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { value?: T; payload?: T };
    if (typeof parsed === 'object' && parsed !== null && 'value' in parsed) return parsed.value ?? fallback;
    if (typeof parsed === 'object' && parsed !== null && 'payload' in parsed) return parsed.payload ?? fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function writeSharedState<T>(key: string, value: T) {
  const root = resolveWindow();
  if (!root) return;

  const payload = JSON.stringify({ key, value, updatedAt: new Date().toISOString() });

  try {
    root.localStorage.setItem(key, payload);
  } catch {
    // ignore storage quota issues
  }

  if ('BroadcastChannel' in root) {
    const channel = new root.BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ key, value, updatedAt: new Date().toISOString() });
    channel.close();
  }

  root.dispatchEvent(new root.CustomEvent('nextech-sync', { detail: { key, value } }));
  void saveSharedStateToFirebase(key, value);
}

export function subscribeSharedState<T>(key: string, handler: (next: T) => void) {
  const root = resolveWindow();
  if (!root) return () => undefined;

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== key || !event.newValue) return;
    try {
      const parsed = JSON.parse(event.newValue) as { value: T };
      handler(parsed.value ?? parsed as unknown as T);
    } catch {
      handler(JSON.parse(event.newValue) as T);
    }
  };

  const handleCustom = (event: Event) => {
    const detail = (event as CustomEvent<{ key: string; value: T }>).detail;
    if (!detail || detail.key !== key) return;
    handler(detail.value);
  };

  const channel = 'BroadcastChannel' in root ? new root.BroadcastChannel(CHANNEL_NAME) : null;
  if (channel) {
    channel.addEventListener('message', (message) => {
      const { key: incomingKey, value } = message.data as { key?: string; value?: T };
      if (incomingKey === key) handler(value as T);
    });
  }

  root.addEventListener('storage', handleStorage);
  root.addEventListener('nextech-sync', handleCustom);

  return () => {
    root.removeEventListener('storage', handleStorage);
    root.removeEventListener('nextech-sync', handleCustom);
    channel?.close();
  };
}
