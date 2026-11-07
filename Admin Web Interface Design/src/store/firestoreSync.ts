import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { getFirestore, collection, addDoc, setDoc, doc, deleteDoc, updateDoc, getDoc, getDocs, onSnapshot, serverTimestamp, query, orderBy } from 'firebase/firestore';

// Firebase web config for project product-inventory-app-fdbc7.
// Prefer Vite env vars (VITE_FIREBASE_*) for production; values below are from existing project config.
const firebaseConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined) || 'AIzaSyCligP6ePhaa3GP5BGMn4I0PLnrEjwDT7s',
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) || 'product-inventory-app-fdbc7.firebaseapp.com',
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) || 'product-inventory-app-fdbc7',
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined) || 'product-inventory-app-fdbc7.firebasestorage.app',
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined) || '6623924421',
  appId: (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined) || '1:6623924421:web:admin-dashboard',
};

export const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firestoreDb = getFirestore(firebaseApp);

export type AuthSession = { uid: string; email: string | null; idToken?: string; role?: string | null };

export function subscribeAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(firebaseAuth, callback);
}

export async function getCurrentUserRole(uid: string): Promise<string | null> {
  try {
    const snap = await getDoc(doc(firestoreDb, 'users', uid));
    if (!snap.exists()) return null;
    return (snap.data()?.role as string | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function ensureUserProfile(user: User, opts?: { fullName?: string }) {
  const ref = doc(firestoreDb, 'users', user.uid);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      // Rules allow self-create for customer/guest/user (never admin). Admin role must be granted in Console.
      await setDoc(ref, {
        uid: user.uid,
        email: user.email ?? '',
        fullName: opts?.fullName?.trim() || user.displayName || user.email?.split('@')[0] || 'User',
        role: 'customer',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return;
    }
    // Never overwrite role here; admins must keep role=admin, customers keep customer/guest/user.
    await setDoc(ref, {
      updatedAt: serverTimestamp(),
      email: user.email ?? snap.data()?.email ?? '',
      uid: user.uid,
    }, { merge: true });
  } catch (err) {
    // Do not block app usage on profile sync; admin/product writes will still be checked by rules.
    console.warn('[firestoreSync] ensureUserProfile skipped (rules/published config may need update):', err);
  }
}

export async function signInAdminWithEmail(email: string, password: string, mode: 'login' | 'signup') {
  if (mode === 'signup') {
    const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
    await updateProfile(cred.user, { displayName: email.split('@')[0] });
    await ensureUserProfile(cred.user);
    return cred.user;
  }
  const cred = await signInWithEmailAndPassword(firebaseAuth, email, password);
  await ensureUserProfile(cred.user);
  return cred.user;
}

export async function signOutFirebaseAuth() {
  await firebaseSignOut(firebaseAuth);
}

export function friendlyFirebaseError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err && typeof err === 'object' && 'code' in (err as any)) ? String((err as any).code) : '';
  if (code === 'permission-denied' || msg.includes('permission-denied') || msg.includes('Missing or insufficient permissions')) {
    return 'Missing or insufficient Firestore permissions. Fix in Firebase Console (project product-inventory-app-fdbc7): (1) Firestore Database → Rules: publish the corrected local file firestore.rules (it uses collection "product" singular and includes required collections/checkout/chatbot rules) — the old rules that only allow "products" plural and role "user" will block this app. (2) Authentication → confirm you are signed in with a real Email/Password user. (3) Firestore → users/{YOUR_AUTH_UID}: set role="admin" (string). Rules block self-elevation, so admin role must be set manually. Cloudinary upload can succeed even when Firestore save is blocked.';
  }
  if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password') || msg.includes('auth/user-not-found')) return 'Invalid email or password.';
  if (msg.includes('auth/email-already-in-use')) return 'That email is already registered. Try signing in.';
  if (msg.includes('auth/weak-password')) return 'Password is too weak (use at least 6 characters).';
  if (msg.includes('auth/network-request-failed')) return 'Network error. Check your internet connection.';
  if (msg.includes('failed-precondition') && msg.includes('index')) return 'Firestore index required for this query. Open the link shown in the browser console to create it, or retry (some views have fallbacks).';
  return msg.replace(/^Firebase:\s*/i, '');
}

export type FirestoreProduct = {
  name: string;
  description: string;
  price: number;
  stock: number;
  imageUrl: string; // Cloudinary secure_url
  // extra fields preserved by admin UI
  sku?: string;
  brand?: string;
  category?: string;
  discount?: number;
  minStock?: number;
  specs?: string;
  warranty?: string;
  status?: string;
  [key: string]: unknown;
};

export function normalizeProductDoc(id: string, data: Record<string, unknown>) {
  const name = String(data.name ?? data.Name ?? data.productName ?? data.title ?? '').trim();
  const price = Number(data.price ?? data.sellingPrice ?? data.unitPrice ?? data.amount ?? 0) || 0;
  const stock = Math.max(0, Math.round(Number(data.stock ?? data.quantity ?? data.qty ?? data.inventory ?? 0) || 0));
  const minStock = Math.max(0, Math.round(Number(data.minStock ?? data.minimumStock ?? data.reorderLevel ?? 5) || 5));
  const status = stock === 0 ? 'Out of Stock' : stock <= minStock ? 'Low Stock' : String(data.status || 'In Stock');
  const imageUrl = String(data.imageUrl ?? data.image_url ?? data.imageURL ?? data.photoUrl ?? data.photoURL ?? data.thumbnailUrl ?? data.image ?? '').trim();
  return {
    id,
    name,
    description: String(data.description ?? data.desc ?? data.details ?? ''),
    price,
    stock,
    minStock,
    status,
    sku: String(data.sku ?? data.SKU ?? data.code ?? id),
    brand: String(data.brand ?? data.Brand ?? data.manufacturer ?? ''),
    category: String(data.category ?? data.Category ?? data.type ?? 'General'),
    discount: Number(data.discount ?? data.discountPercent ?? 0) || 0,
    image: imageUrl,
    imageUrl,
    specs: String(data.specs ?? data.specifications ?? ''),
    warranty: String(data.warranty ?? ''),
    ...data,
  };
}

export async function fetchProductsFromFirestore(): Promise<any[]> {
  try {
    const snap = await getDocs(query(collection(firestoreDb, 'product'), orderBy('updatedAt', 'desc')));
    return snap.docs.map((d) => normalizeProductDoc(d.id, d.data() as Record<string, unknown>));
  } catch (err) {
    console.warn('[firestoreSync] ordered products fetch failed, retrying without orderBy:', err);
    const snap = await getDocs(collection(firestoreDb, 'product'));
    return snap.docs.map((d) => normalizeProductDoc(d.id, d.data() as Record<string, unknown>));
  }
}

export function subscribeProductsFromFirestore(
  onData: (products: any[]) => void,
  onError?: (error: unknown) => void,
) {
  const col = collection(firestoreDb, 'product');
  const ordered = query(col, orderBy('updatedAt', 'desc'));
  let fallbackUnsub: (() => void) | null = null;
  const unsub = onSnapshot(
    ordered,
    (snap) => onData(snap.docs.map((d) => normalizeProductDoc(d.id, d.data() as Record<string, unknown>))),
    (err) => {
      console.warn('[firestoreSync] ordered products snapshot failed; falling back to unordered:', err);
      onError?.(err);
      fallbackUnsub = onSnapshot(
        col,
        (snap) => onData(snap.docs.map((d) => normalizeProductDoc(d.id, d.data() as Record<string, unknown>))),
        (err2) => { console.error('[firestoreSync] products snapshot failed:', err2); onError?.(err2); },
      );
    },
  );
  return () => { unsub(); fallbackUnsub?.(); };
}

export async function saveProductToFirestore(product: FirestoreProduct & { id?: string }): Promise<string> {
  const { id, ...data } = product;
  const imageUrl = String(data.imageUrl || '').trim(); // never save empty string as "uploaded image" marker except explicit empty
  const payload: Record<string, unknown> = {
    name: String(data.name || '').trim(),
    description: String(data.description || ''),
    price: Number(data.price) || 0,
    stock: Math.max(0, Math.round(Number(data.stock) || 0)),
    sku: String(data.sku || ''),
    brand: String(data.brand || ''),
    category: String(data.category || 'General'),
    discount: Number(data.discount) || 0,
    minStock: Math.max(0, Math.round(Number(data.minStock) || 5)),
    specs: String(data.specs || ''),
    warranty: String(data.warranty || ''),
    status: String(data.status || ''),
    updatedAt: serverTimestamp(),
  };
  if (imageUrl) {
    payload.imageUrl = imageUrl; // canonical Cloudinary secure_url
    payload.image = imageUrl;    // compatibility
  } else if (typeof data.image === 'string' && data.image.trim()) {
    payload.imageUrl = data.image.trim();
    payload.image = data.image.trim();
  }
  if (id) {
    await setDoc(doc(firestoreDb, 'product', id), { ...payload, createdAt: serverTimestamp() }, { merge: true });
    return id;
  }
  const ref = await addDoc(collection(firestoreDb, 'product'), { ...payload, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updateProductInFirestore(id: string, updates: Partial<FirestoreProduct>): Promise<void> {
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) continue;
    if (k === 'imageUrl' || k === 'image') {
      const url = String(v || '').trim();
      if (url) { payload.imageUrl = url; payload.image = url; } // do not save empty image URL over existing
      continue;
    }
    payload[k] = v;
  }
  if (typeof payload.price === 'number') payload.price = Number(payload.price) || 0;
  if (typeof payload.stock === 'number') payload.stock = Math.max(0, Math.round(Number(payload.stock) || 0));
  await updateDoc(doc(firestoreDb, 'product', id), payload);
}

export function normalizeOrderDoc(docId: string, data: Record<string, unknown>) {
  const address = (data.address && typeof data.address === 'object') ? data.address as Record<string, unknown> : {};
  const items = Array.isArray(data.items) ? data.items : [];
  const products = Array.isArray(data.products)
    ? data.products.map(String)
    : items.map((it: any) => String(it?.product?.name ?? it?.name ?? it?.productName ?? 'Product')).filter(Boolean);
  const ts = (v: unknown) => {
    if (v && typeof v === 'object' && 'toDate' in (v as any)) try { return (v as any).toDate().toISOString(); } catch {}
    if (v && typeof v === 'object' && 'seconds' in (v as any)) return new Date(Number((v as any).seconds) * 1000).toISOString();
    return typeof v === 'string' ? v : '';
  };
  const displayId = String(data.id ?? data.orderId ?? docId);
  return {
    docId, // real Firestore document ID for updates
    id: displayId,
    orderId: displayId,
    customerId: String(data.customerId ?? data.userId ?? data.uid ?? ''),
    customer: String(data.customer ?? address.fullName ?? data.customerName ?? 'Customer'),
    date: ts(data.date) || ts(data.createdAt) || ts(data.updatedAt) || '',
    createdAt: ts(data.createdAt) || ts(data.date) || '',
    updatedAt: ts(data.updatedAt) || '',
    products,
    items,
    total: Number(data.total ?? data.amount ?? 0) || 0,
    paymentMethod: String(data.paymentMethod ?? data.method ?? 'Cash on Delivery'),
    paymentStatus: String(data.paymentStatus ?? 'Pending Verification'),
    orderStatus: String(data.orderStatus ?? data.status ?? 'Pending'),
    paymentReference: String(data.paymentReference ?? data.reference ?? ''),
    paymentProofUrl: String(data.paymentProofUrl ?? data.proofUrl ?? ''),
    paymentNote: String(data.paymentNote ?? ''),
    address,
  };
}

export function subscribeOrdersFromFirestore(
  onData: (orders: any[]) => void,
  onError?: (error: unknown) => void,
) {
  const col = collection(firestoreDb, 'orders');
  const ordered = query(col, orderBy('updatedAt', 'desc'));
  let fallbackUnsub: (() => void) | null = null;
  const unsub = onSnapshot(
    ordered,
    (snap) => onData(snap.docs.map((d) => normalizeOrderDoc(d.id, d.data() as Record<string, unknown>))),
    (err) => {
      console.warn('[firestoreSync] ordered orders snapshot failed; falling back to unordered:', err);
      onError?.(err);
      fallbackUnsub = onSnapshot(col, (snap) => onData(snap.docs.map((d) => normalizeOrderDoc(d.id, d.data() as Record<string, unknown>))), (e2) => onError?.(e2));
    },
  );
  return () => { unsub(); fallbackUnsub?.(); };
}

export function subscribeCustomerLocationsFromFirestore(
  onData: (rows: any[]) => void,
  onError?: (error: unknown) => void,
) {
  const col = collection(firestoreDb, 'customer_locations');
  return onSnapshot(col, (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))), (err) => onError?.(err));
}

// USER MANAGEMENT (admin): users collection is source of truth for roles/profiles.
export function subscribeUsersFromFirestore(
  onData: (rows: any[]) => void,
  onError?: (error: unknown) => void,
) {
  const col = collection(firestoreDb, 'users');
  let fallbackUnsub: (() => void) | null = null;
  const ordered = query(col, orderBy('updatedAt', 'desc'));
  const unsub = onSnapshot(
    ordered,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))),
    (err) => {
      console.warn('[Admin/Firestore] ordered users subscription failed; retrying unordered', err);
      if (fallbackUnsub) return;
      fallbackUnsub = onSnapshot(col, (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))), (e) => onError?.(e));
    },
  );
  return () => { fallbackUnsub?.(); unsub(); };
}

export async function updateUserRoleInFirestore(userId: string, role: 'admin' | 'customer' | 'guest') {
  const actor = firebaseAuth.currentUser;
  if (!actor) throw new Error('Not signed in.');
  if (actor.uid === userId) throw new Error('You cannot change your own role from the admin UI.');
  const actorRole = await getCurrentUserRole(actor.uid);
  if (actorRole !== 'admin') throw new Error('Only admins can change user roles.');
  if (!['admin', 'customer', 'guest'].includes(role)) throw new Error('Invalid role.');
  await updateDoc(doc(firestoreDb, 'users', userId), {
    role,
    roleUpdatedAt: serverTimestamp(),
    roleUpdatedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
}

export async function updateOrderStatusInFirestore(id: string, orderStatus: string, extra?: Record<string, unknown>): Promise<void> {
  await updateDoc(doc(firestoreDb, 'orders', id), { orderStatus, status: orderStatus, updatedAt: serverTimestamp(), ...(extra || {}) });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Generic Firestore helpers (auto-create collections/docs on first write)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function tsValue(v: unknown): string {
  if (v && typeof v === 'object' && 'toDate' in (v as any)) { try { return (v as any).toDate().toISOString(); } catch { /* ignore */ } }
  if (v && typeof v === 'object' && 'seconds' in (v as any)) return new Date(Number((v as any).seconds) * 1000).toISOString();
  return typeof v === 'string' ? v : '';
}
function mapDoc(id: string, data: Record<string, unknown>) {
  return { id, ...data, createdAt: tsValue(data.createdAt) || data.createdAt, updatedAt: tsValue(data.updatedAt) || data.updatedAt };
}
export function subscribeCollection(colName: string, onData: (rows: any[]) => void, onError?: (e: unknown) => void, orderField = 'updatedAt') {
  const col = collection(firestoreDb, colName);
  try {
    const q = query(col, orderBy(orderField, 'desc'));
    return onSnapshot(q, (s) => onData(s.docs.map((d) => mapDoc(d.id, d.data() as any))), (err) => {
      console.warn(`[firestoreSync] ${colName} ordered snapshot failed, falling back:`, err);
      onError?.(err);
      onSnapshot(col, (s) => onData(s.docs.map((d) => mapDoc(d.id, d.data() as any))), (e2) => onError?.(e2));
    });
  } catch (e) {
    return onSnapshot(col, (s) => onData(s.docs.map((d) => mapDoc(d.id, d.data() as any))), (err) => onError?.(err));
  }
}
export async function createDoc(colName: string, data: Record<string, unknown>, id?: string) {
  const payload = { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  if (id) { await setDoc(doc(firestoreDb, colName, id), payload, { merge: true }); return id; }
  const ref = await addDoc(collection(firestoreDb, colName), payload);
  return ref.id;
}
export async function upsertDoc(colName: string, id: string, data: Record<string, unknown>) {
  await setDoc(doc(firestoreDb, colName, id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}
export async function patchDoc(colName: string, id: string, data: Record<string, unknown>) {
  await updateDoc(doc(firestoreDb, colName, id), { ...data, updatedAt: serverTimestamp() });
}
export async function removeDoc(colName: string, id: string) {
  await deleteDoc(doc(firestoreDb, colName, id));
}

// CATEGORIES (admin manages; customers browse)
export const subscribeCategories = (cb: (r: any[]) => void, err?: (e: unknown) => void) => subscribeCollection('categories', cb, err);
export const saveCategory = (data: any, id?: string) => createDoc('categories', { name: String(data.name||'').trim(), description: String(data.description||''), image: String(data.image||''), active: data.active !== false }, id);
export const updateCategory = (id: string, data: any) => patchDoc('categories', id, data);
export const deleteCategory = (id: string) => removeDoc('categories', id);

// PROMOTIONS (admin manages; customers read active)
export const subscribePromotions = (cb: (r: any[]) => void, err?: (e: unknown) => void) => subscribeCollection('promotions', cb, err);
export const savePromotion = (data: any, id?: string) => createDoc('promotions', { title: String(data.title||'').trim(), description: String(data.description||''), discountType: String(data.discountType||'percent'), discountValue: Number(data.discountValue)||0, code: String(data.code||'').trim().toUpperCase(), active: data.active !== false, startDate: String(data.startDate||''), endDate: String(data.endDate||'') }, id);
export const updatePromotion = (id: string, data: any) => patchDoc('promotions', id, data);
export const deletePromotion = (id: string) => removeDoc('promotions', id);

// REVIEWS (customers submit; admins view/manage)
export const subscribeReviews = (cb: (r: any[]) => void, err?: (e: unknown) => void) => subscribeCollection('reviews', cb, err);
export const deleteReview = (id: string) => removeDoc('reviews', id);

// NOTIFICATIONS (admin/customer; owner reads own)
export const subscribeNotifications = (cb: (r: any[]) => void, err?: (e: unknown) => void) => subscribeCollection('notifications', cb, err);
export const createNotification = (data: any, id?: string) => createDoc('notifications', { userId: String(data.userId||''), title: String(data.title||''), message: String(data.message||''), type: String(data.type||'system'), read: false, orderId: String(data.orderId||'') }, id);
export const markNotificationRead = (id: string) => patchDoc('notifications', id, { read: true });
export const deleteNotification = (id: string) => removeDoc('notifications', id);

// PAYMENTS (records only; NO card/CVV ever)
export const subscribePayments = (cb: (r: any[]) => void, err?: (e: unknown) => void) => subscribeCollection('payments', cb, err);
export async function createPaymentRecord(data: any, id?: string) {
  const safe = { orderId: String(data.orderId||''), userId: String(data.userId||''), customer: String(data.customer||''), amount: Number(data.amount)||0, method: String(data.method||''), status: String(data.status||'Pending Verification'), reference: String(data.reference||''), proofUrl: String(data.proofUrl||'') };
  return createDoc('payments', safe, id);
}
export const updatePaymentRecord = (id: string, data: any) => patchDoc('payments', id, { status: String(data.status||''), orderId: data.orderId, method: data.method, reference: data.reference });

export async function deleteProductFromFirestore(id: string): Promise<void> {
  await deleteDoc(doc(firestoreDb, 'product', id));
}
