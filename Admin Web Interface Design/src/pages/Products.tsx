import { useEffect, useState } from 'react';
import { PRODUCT_SYNC_KEY, readSharedState, subscribeSharedState, writeSharedState } from '../store/sharedSync';
import { uploadImageToCloudinary, validateImageFile } from '../utils/cloudinary';
import { saveProductToFirestore, updateProductInFirestore, deleteProductFromFirestore, friendlyFirebaseError, subscribeProductsFromFirestore, fetchProductsFromFirestore, subscribeReviews } from '../store/firestoreSync';

const categories = ['Laptops', 'Monitors', 'Headphones', 'Peripherals', 'Tablets', 'Storage', 'Networking', 'Components'];
const brands = ['Apple', 'ASUS', 'Dell', 'Sony', 'Logitech', 'Samsung', 'Keychron', 'HP', 'Lenovo', 'Razer'];

interface Product {
  id: string;
  name: string;
  sku: string;
  brand: string;
  category: string;
  description: string;
  price: number;
  discount: number;
  stock: number;
  minStock: number;
  image: string; // display URL (Cloudinary secure_url or legacy)
  imageUrl?: string; // Firestore/Cloudinary canonical field
  specs: string;
  warranty: string;
  status: string;
}

interface Category {
  id: string;
  name: string;
  description: string;
  productCount: number;
}

const emptyProduct: Omit<Product, 'id' | 'status'> = {
  name: '', sku: '', brand: '', category: '', description: '',
  price: 0, discount: 0, stock: 0, minStock: 5,
  image: '', imageUrl: '', specs: '', warranty: '1 Year'
};

const PLACEHOLDER_IMAGE = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="100%" height="100%" fill="#1a2540"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#6b7fa8" font-size="12" font-family="Arial">No Image</text></svg>');

export default function Products({ searchQuery }: { searchQuery: string }) {
  const [products, setProducts] = useState<Product[]>(() => readSharedState<Product[]>(PRODUCT_SYNC_KEY, []));
  const [categoriesList, setCategoriesList] = useState<Category[]>([]);
  const [activeTab, setActiveTab] = useState<'products' | 'categories' | 'inventory'>('products');
  const [modal, setModal] = useState<null | 'add' | 'edit' | 'view' | 'delete' | 'add-category' | 'edit-category'>(null);
  const [selected, setSelected] = useState<Product | Category | null>(null);
  const [form, setForm] = useState<typeof emptyProduct>(emptyProduct);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [reviews, setReviews] = useState<any[]>([]);

  const ratingFor = (p: Product) => {
    const id = String((p as any).id || '');
    const name = String((p as any).name || '').trim();
    const rows = reviews.filter(r => {
      const pid = String(r.productId || '').trim();
      const pname = String(r.productName || '').trim();
      return (id && pid === id) || (name && pname && pname.toLowerCase() === name.toLowerCase());
    }).filter(r => Number(r.rating) > 0);
    if (!rows.length) return null;
    const avg = rows.reduce((s, r) => s + Math.max(1, Math.min(5, Number(r.rating) || 0)), 0) / rows.length;
    return { avg, count: rows.length };
  };
  const stars = (avg: number) => {
    const full = Math.round(Math.max(0, Math.min(5, avg)));
    return '★'.repeat(full) + '☆'.repeat(5 - full);
  };

  useEffect(() => {
    let unsubLocal: (() => void) | undefined;
    const apply = (next: any[]) => {
      if (!Array.isArray(next)) return;
      console.info(`[Products] Firestore snapshot: ${next.length} product(s)`, next.map((p) => ({ id: p.id, name: p.name, hasImage: Boolean(p.imageUrl || p.image) })));
      setProducts(next as Product[]);
      writeSharedState(PRODUCT_SYNC_KEY, next);
      buildCategoriesFromProducts(next);
    };

    // Real-time source of truth: Firestore collection product (same project as mobile).
    const unsubFirestore = subscribeProductsFromFirestore(apply, (err) => {
      console.error('[Products] Firestore products listener error (check auth/rules/indexes):', err);
      void fetchProductsFromFirestore().then(apply).catch((e) => console.error('[Products] Firestore fetch fallback failed:', e));
    });
    const unsubReviews = subscribeReviews((rows) => setReviews(Array.isArray(rows) ? rows : []), (err) => console.warn('[Products] reviews listener error (publish rules / check permissions):', err));

    // Keep local/tab sync for compatibility with other admin pages still using shared state.
    unsubLocal = subscribeSharedState<Product[]>(PRODUCT_SYNC_KEY, (next) => {
      // Ignore empty local payloads that would wipe the real Firestore snapshot.
      if (Array.isArray(next) && next.length) {
        setProducts(next);
        buildCategoriesFromProducts(next);
      }
    });

    return () => { unsubFirestore(); unsubReviews?.(); unsubLocal?.(); };
  }, []);

  const buildCategoriesFromProducts = (prodList: any[]) => {
    const catMap = new Map<string, { name: string; count: number }>();
    prodList.forEach(p => {
      const cat = p.category || 'General';
      if (catMap.has(cat)) {
        catMap.get(cat)!.count += 1;
      } else {
        catMap.set(cat, { name: cat, count: 1 });
      }
    });
    setCategoriesList(Array.from(catMap.entries(), ([id, data]) => ({ id, name: data.name, description: '', productCount: data.count })));
  };

  const filtered = products
    .filter(p => {
      const q = searchQuery.toLowerCase();
      const match = !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q);
      const cat = !filterCategory || p.category === filterCategory;
      const st = !filterStatus || p.status === filterStatus;
      return match && cat && st;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'price') return b.price - a.price;
      if (sortBy === 'stock') return a.stock - b.stock;
      return 0;
    });

  const statusBadge = (status: string) => {
    if (status === 'In Stock') return 'badge-success';
    if (status === 'Low Stock') return 'badge-warning';
    return 'badge-danger';
  };

  const openAdd = () => { setForm(emptyProduct); setImagePreview(''); setUploadError(''); setUploadProgress(0); setModal('add'); };
  const openEdit = (p: Product) => {
    const imageValue = (p as any).imageUrl || p.image || '';
    setSelected(p);
    setForm({ name: p.name, sku: p.sku, brand: p.brand, category: p.category, description: p.description, price: p.price, discount: p.discount, stock: p.stock, minStock: p.minStock, image: imageValue, imageUrl: imageValue, specs: p.specs, warranty: p.warranty });
    setImagePreview(imageValue);
    setUploadError(''); setUploadProgress(0);
    setModal('edit');
  };
  const openView = (p: Product) => { setSelected(p); setModal('view'); };
  const openDelete = (p: Product) => { setSelected(p); setModal('delete'); };

  const getImageSrc = (p: Partial<Product>) => (p.imageUrl || p.image || '').trim() || PLACEHOLDER_IMAGE;

  const handleImageFileChange = async (file?: File | null) => {
    if (!file) return;
    setUploadError('');
    const validation = validateImageFile(file);
    if (validation) { setUploadError(validation); return; }
    // local preview immediately
    const localUrl = URL.createObjectURL(file);
    setImagePreview(localUrl);
    setUploadingImage(true);
    setUploadProgress(0);
    try {
      const secureUrl = await uploadImageToCloudinary(file, (p) => setUploadProgress(p));
      setForm(prev => ({ ...prev, image: secureUrl, imageUrl: secureUrl }));
      setImagePreview(secureUrl);
      setUploadProgress(100);
    } catch (err: any) {
      setUploadError(err?.message || 'Image upload failed. Please try again.');
      setUploadProgress(0);
      // keep existing image on edit; clear new preview on add failure
      if (modal === 'add') setImagePreview('');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    const name = form.name.trim();
    const description = form.description.trim();
    if (!name) { setUploadError('Product name is required.'); return; }
    if (!description) { setUploadError('Description is required.'); return; }
    if (!Number.isFinite(form.price) || form.price < 0) { setUploadError('Price must be 0 or greater.'); return; }
    if (!Number.isFinite(form.stock) || form.stock < 0 || !Number.isInteger(form.stock)) { setUploadError('Stock must be a whole number 0 or greater.'); return; }
    if (uploadingImage) { setUploadError('Please wait for the image upload to finish.'); return; }

    const stock = form.stock;
    const min = form.minStock;
    const status = stock === 0 ? 'Out of Stock' : stock <= min ? 'Low Stock' : 'In Stock';
    // Preserve existing image if editing and no new URL was provided
    const existingImage = modal === 'edit' && selected && 'sku' in selected ? ((selected as any).imageUrl || selected.image || '') : '';
    const imageUrl = (form.imageUrl || form.image || existingImage || '').trim();

    try {
      let nextProducts: Product[];
      if (modal === 'add') {
        const base = { ...form, image: imageUrl, imageUrl, status };
        const firestoreId = await saveProductToFirestore({ ...base, imageUrl });
        const newP: Product = { ...base, id: firestoreId, status } as Product;
        nextProducts = [...products, newP];
      } else if (modal === 'edit' && selected && 'sku' in selected) {
        const updated = { ...selected, ...form, image: imageUrl, imageUrl, status } as Product;
        nextProducts = products.map(p => p.id === selected.id ? updated : p);
        // Save Cloudinary secure_url to Firestore imageUrl (and keep existing if unchanged)
        await updateProductInFirestore(selected.id, { ...form, imageUrl, image: imageUrl, status });
      } else {
        nextProducts = products;
      }

      setProducts(nextProducts);
      writeSharedState(PRODUCT_SYNC_KEY, nextProducts);
      buildCategoriesFromProducts(nextProducts);
      setUploadError('');
      setModal(null);
    } catch (err: any) {
      const msg = friendlyFirebaseError(err) || 'Failed to save product. Check Firebase/Firestore access and try again.';
      setUploadError(msg);
      console.error('[Products] Firestore save failed (image upload may already have succeeded):', err);
    }
  };

  const handleDelete = async () => {
    if (selected && 'sku' in selected) {
      try { await deleteProductFromFirestore(selected.id); } catch { /* keep local removal even if Firestore delete fails */ }
      const nextProducts = products.filter(p => p.id !== selected.id);
      setProducts(nextProducts);
      writeSharedState(PRODUCT_SYNC_KEY, nextProducts);
      buildCategoriesFromProducts(nextProducts);
    }
    setModal(null);
  };

  const updateStock = (id: string, newStock: number) => {
    const nextProducts = products.map(p => {
      if (p.id !== id) return p;
      const min = p.minStock;
      const status = newStock === 0 ? 'Out of Stock' : newStock <= min ? 'Low Stock' : 'In Stock';
      return { ...p, stock: newStock, status };
    });
    setProducts(nextProducts);
    writeSharedState(PRODUCT_SYNC_KEY, nextProducts);
    buildCategoriesFromProducts(nextProducts);
  };

  const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <label className="form-label">{label}</label>
      {children}
    </div>
  );

  return (
    <div className="page-fade" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #1e2d4a', marginBottom: 12 }}>
        {['products', 'categories', 'inventory'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            style={{
              padding: '8px 16px', borderRadius: '8px 8px 0 0', border: 'none', borderBottom: activeTab === tab ? '2px solid #4f8ef7' : 'none',
              background: activeTab === tab ? 'rgba(79,142,247,0.15)' : 'transparent',
              color: activeTab === tab ? '#4f8ef7' : '#8b9fc8',
              cursor: 'pointer', fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: activeTab === tab ? 700 : 500,
              transition: 'all 0.15s'
            }}
          >
            {tab === 'products' ? 'Products' : tab === 'categories' ? 'Categories' : 'Inventory'}
          </button>
        ))}
      </div>

      {/* === PRODUCTS TAB === */}
      {activeTab === 'products' && (
        <>
          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <select className="admin-input" style={{ width: 160 }} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
              <option value="">All Categories</option>
              {categories.map(c => <option key={c}>{c}</option>)}
            </select>
            <select className="admin-input" style={{ width: 140 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Status</option>
              <option>In Stock</option>
              <option>Low Stock</option>
              <option>Out of Stock</option>
            </select>
            <select className="admin-input" style={{ width: 130 }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="name">Sort: Name</option>
              <option value="price">Sort: Price</option>
              <option value="stock">Sort: Stock</option>
            </select>
            <div style={{ flex: 1 }} />
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#4b5e82' }}>{filtered.length} products</span>
            <button className="btn-primary" onClick={openAdd}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Product
            </button>
          </div>

          {/* Table */}
          <div className="admin-card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Category</th>
                    <th>Brand</th>
                    <th>Price</th>
                    <th>Rating</th>
                    <th>Discount</th>
                    <th>Stock</th>
                    <th>Min Stock</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <img src={getImageSrc(p)} alt={p.name} onError={e => { (e.currentTarget as HTMLImageElement).src = PLACEHOLDER_IMAGE; }} style={{ width: 38, height: 38, borderRadius: 8, objectFit: 'cover', background: '#1a2540', flexShrink: 0 }} />
                          <div>
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 600, color: '#c8d8f0' }}>{p.name}</div>
                            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#4b5e82' }}>{p.id}</div>
                          </div>
                        </div>
                      </td>
                      <td><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#6b7fa8' }}>{p.sku}</span></td>
                      <td><span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#8b9fc8' }}>{p.category}</span></td>
                      <td><span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#8b9fc8' }}>{p.brand}</span></td>
                      <td><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: '#e2eaf8', fontWeight: 600 }}>₱{p.price.toLocaleString()}</span></td>
                      <td><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: p.discount > 0 ? '#10b981' : '#4b5e82' }}>{p.discount > 0 ? `-${p.discount}%` : '—'}</span></td>
                      <td><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 600, color: p.stock <= p.minStock ? '#f59e0b' : '#e2eaf8' }}>{p.stock}</span></td>
                      <td><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#4b5e82' }}>{p.minStock}</span></td>
                      <td><span className={'badge ' + statusBadge(p.status)}>{p.status}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn-secondary btn-sm" onClick={() => openView(p)} title="View">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          </button>
                          <button className="btn-ghost btn-sm" onClick={() => openEdit(p)} title="Edit">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          <button className="btn-danger btn-sm" onClick={() => openDelete(p)} title="Delete">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* === CATEGORIES TAB === */}
      {activeTab === 'categories' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }} />
            <button className="btn-primary" onClick={() => { setForm(emptyProduct); setModal('add-category'); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Category
            </button>
          </div>

          <div className="admin-card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Description</th>
                    <th>Products</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {categoriesList.map(c => (
                    <tr key={c.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#1a2540', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#c8d8f0', fontSize: 12 }}>
                            {c.name.charAt(0)}
                          </div>
                          <div>
                            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 600, color: '#c8d8f0' }}>{c.name}</div>
                            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#4b5e82' }}>{c.id}</div>
                          </div>
                        </div>
                      </td>
                      <td><span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#8b9fc8' }}>{c.description || '—'}</span></td>
                      <td><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 600, color: '#4b5e82' }}>{c.productCount}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn-ghost btn-sm" onClick={() => { setSelected(c); setModal('edit-category'); }} title="Edit">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* === INVENTORY TAB === */}
      {activeTab === 'inventory' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {[
              { label: 'Total Products', val: products.length, color: '#4f8ef7' },
              { label: 'In Stock', val: products.filter(p => p.status === 'In Stock').length, color: '#10b981' },
              { label: 'Low Stock', val: products.filter(p => p.status === 'Low Stock').length, color: '#f59e0b' },
              { label: 'Out of Stock', val: products.filter(p => p.status === 'Out of Stock').length, color: '#ef4444' }
            ].map(s => (
              <div key={s.label} className="admin-card" style={{ padding: '16px 20px' }}>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 26, color: s.color, letterSpacing: '-0.02em' }}>{s.val}</div>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#8b9fc8', marginTop: 3 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div className="admin-card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Category</th>
                    <th>Current Stock</th>
                    <th>Min Stock</th>
                    <th>Stock Level</th>
                    <th>Status</th>
                    <th>Stock Value</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products
                    .filter(p => {
                      const q = searchQuery.toLowerCase();
                      const match = !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
                      const st = !filterStatus || p.status === filterStatus;
                      return match && st;
                    })
                    .sort((a, b) => {
                      if (sortBy === 'name') return a.name.localeCompare(b.name);
                      if (sortBy === 'stock') return a.stock - b.stock;
                      if (sortBy === 'price') return b.price - a.price;
                      return 0;
                    })
                    .map(p => {
                      const pct = Math.min((p.stock / Math.max(p.minStock * 3, 1)) * 100, 100);
                      const barColor = p.status === 'In Stock' ? '#10b981' : p.status === 'Low Stock' ? '#f59e0b' : '#ef4444';
                      const stockValue = p.price * p.stock;
                      return (
                        <tr key={p.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <img src={getImageSrc(p)} alt={p.name} onError={e => { (e.currentTarget as HTMLImageElement).src = PLACEHOLDER_IMAGE; }} style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', background: '#1a2540', flexShrink: 0 }} />
                              <div>
                                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 600, color: '#c8d8f0' }}>{p.name}</div>
                                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#4b5e82' }}>{p.id}</div>
                              </div>
                            </div>
                          </td>
                          <td><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#6b7fa8' }}>{p.sku}</span></td>
                          <td><span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#8b9fc8' }}>{p.category}</span></td>
                          <td>
                            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 15, fontWeight: 700, color: p.stock === 0 ? '#ef4444' : p.stock <= p.minStock ? '#f59e0b' : '#e2eaf8' }}>
                              {p.stock}
                            </span>
                          </td>
                          <td><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#4b5e82' }}>{p.minStock}</span></td>
                          <td style={{ minWidth: 120 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#1e2d4a', overflow: 'hidden' }}>
                                <div style={{ width: pct + '%', height: '100%', borderRadius: 3, background: barColor, transition: 'width 0.3s' }} />
                              </div>
                              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#4b5e82', width: 32, textAlign: 'right' }}>{Math.round(pct)}%</span>
                            </div>
                          </td>
                          <td>
                            <span className={'badge ' + (p.status === 'In Stock' ? 'badge-success' : p.status === 'Low Stock' ? 'badge-warning' : 'badge-danger')}>
                              {p.status}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 600, color: p.stock === 0 ? '#4b5e82' : '#4f8ef7' }}>
                              {p.stock === 0 ? '—' : '₱' + stockValue.toLocaleString()}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <input
                                type="number"
                                value={p.stock}
                                onChange={e => {
                                  const v = parseInt(e.target.value, 10) || 0;
                                  updateStock(p.id, v);
                                }}
                                style={{ width: 60, padding: '6px 8px', borderRadius: 6, border: '1px solid #1f2e4a', background: '#0d1729', color: '#edf2ff', fontSize: 12 }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* === Add/Edit Product Modal === */}
      {(modal === 'add' || modal === 'edit') && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal-box" style={{ maxWidth: 720 }}>
            <div style={{ padding: '22px 28px 18px', borderBottom: '1px solid #1e2d4a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 18, color: '#e2eaf8' }}>{modal === 'add' ? 'Add New Product' : 'Edit Product'}</div>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', color: '#4b5e82', cursor: 'pointer' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <F label="Product Name"><input className="admin-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Apple MacBook Pro 16&quot;" /></F>
                <F label="SKU"><input className="admin-input" value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} placeholder="e.g. MBP16-M3-512" /></F>
                <F label="Brand">
                  <select className="admin-input" value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })}>
                    <option value="">Select Brand</option>
                    {brands.map(b => <option key={b}>{b}</option>)}
                  </select>
                </F>
                <F label="Category">
                  <select className="admin-input" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                    <option value="">Select Category</option>
                    {categories.map(c => <option key={c}>{c}</option>)}
                  </select>
                </F>
              </div>
              <F label="Description"><textarea className="admin-input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Product description..." /></F>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16 }}>
                <F label="Price (₱)"><input className="admin-input" type="number" value={form.price || ''} onChange={e => setForm({ ...form, price: Number(e.target.value) })} placeholder="0" /></F>
                <F label="Discount (%)"><input className="admin-input" type="number" value={form.discount || ''} onChange={e => setForm({ ...form, discount: Number(e.target.value) })} placeholder="0" /></F>
                <F label="Stock Qty"><input className="admin-input" type="number" value={form.stock || ''} onChange={e => setForm({ ...form, stock: Number(e.target.value) })} placeholder="0" /></F>
                <F label="Min Stock"><input className="admin-input" type="number" value={form.minStock || ''} onChange={e => setForm({ ...form, minStock: Number(e.target.value) })} placeholder="5" /></F>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <F label="Product Image (Cloudinary)">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      disabled={uploadingImage}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        await handleImageFileChange(file);
                        e.currentTarget.value = ''; // allow reselecting same file
                      }}
                      style={{ width: '100%', padding: '12px', borderRadius: 10, border: '2px dashed #3a4f72', background: '#0d1729', color: '#c8d8f0', cursor: uploadingImage ? 'wait' : 'pointer' }}
                    />
                    {uploadingImage && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontSize: 12, color: '#4f8ef7' }}>Uploading to Cloudinary… {uploadProgress}%</div>
                        <div style={{ height: 8, background: '#1e2d4a', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${uploadProgress}%`, background: 'linear-gradient(90deg,#4f8ef7,#7c3aed)', transition: 'width 0.15s' }} />
                        </div>
                      </div>
                    )}
                    {(imagePreview || form.imageUrl || form.image) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <img src={imagePreview || form.imageUrl || form.image || PLACEHOLDER_IMAGE} alt="preview" onError={e => { (e.currentTarget as HTMLImageElement).src = PLACEHOLDER_IMAGE; }} style={{ width: 72, height: 72, borderRadius: 8, objectFit: 'cover', background: '#1a2540' }} />
                        <span style={{ fontSize: 11, color: (form.imageUrl || form.image || '').startsWith('http') ? '#10b981' : '#4f8ef7' }}>
                          {(form.imageUrl || form.image || '').startsWith('https://res.cloudinary.com') ? 'Cloudinary secure_url saved' : (form.imageUrl || form.image) ? 'Image set (URL preserved unless replaced)' : 'No image'}
                        </span>
                      </div>
                    )}
                    {uploadError && <div style={{ fontSize: 12, color: '#f87171', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '8px 10px' }}>{uploadError}</div>}
                    <span style={{ fontSize: 10, color: '#4b5e82' }}>Allowed: JPG/PNG/WEBP/GIF, max 5 MB. Uses unsigned preset <b>mcommerce_products</b> (public; not admin authorization). Existing image stays unchanged if you don&apos;t select a new file.</span>
                    <input className="admin-input" value={form.imageUrl || form.image} onChange={e => setForm({ ...form, image: e.target.value, imageUrl: e.target.value })} placeholder="Or paste image URL (https://...)" />
                  </div>
                </F>
                <F label="Warranty"><input className="admin-input" value={form.warranty} onChange={e => setForm({ ...form, warranty: e.target.value })} placeholder="e.g. 1 Year" /></F>
              </div>
              <F label="Specifications"><textarea className="admin-input" value={form.specs} onChange={e => setForm({ ...form, specs: e.target.value })} placeholder="Key specs separated by comma..." /></F>
            </div>
            <div style={{ padding: '16px 28px', borderTop: '1px solid #1e2d4a', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave}>{modal === 'add' ? 'Add Product' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* === View Product Modal === */}
      {modal === 'view' && selected && 'sku' in selected && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal-box" style={{ maxWidth: 640 }}>
            <div style={{ padding: '22px 28px 18px', borderBottom: '1px solid #1e2d4a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 18, color: '#e2eaf8' }}>Product Details</div>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', color: '#4b5e82', cursor: 'pointer' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ padding: '22px 28px', display: 'flex', gap: 24 }}>
              <img src={getImageSrc(selected as Product)} alt={selected.name} onError={e => { (e.currentTarget as HTMLImageElement).src = PLACEHOLDER_IMAGE; }} style={{ width: 120, height: 120, borderRadius: 12, objectFit: 'cover', background: '#1a2540', flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 20, color: '#e2eaf8' }}>{selected.name}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span className={'badge ' + (selected.status === 'In Stock' ? 'badge-success' : selected.status === 'Low Stock' ? 'badge-warning' : 'badge-danger')}>{selected.status}</span>
                  <span className="badge badge-neutral">{selected.category}</span>
                  <span className="badge badge-neutral">{selected.brand}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {(() => { const r = ratingFor(selected as Product); return [['SKU', selected.sku], ['Price', '₱' + selected.price.toLocaleString()], ['Rating', r ? `${r.avg.toFixed(1)} / 5 (${r.count} review${r.count === 1 ? '' : 's'})` : 'No ratings yet'], ['Discount', selected.discount + '%'], ['Stock', selected.stock + ' units'], ['Min Stock', selected.minStock + ' units'], ['Warranty', selected.warranty]]; })().map(([k, v]) => (
                    <div key={k}>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#4b5e82', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k}</div>
                      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#c8d8f0', fontWeight: 500 }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#4b5e82', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Description</div>
                  <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#8b9fc8', lineHeight: 1.6 }}>{selected.description}</div>
                </div>
                <div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#4b5e82', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Specifications</div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#6b7fa8' }}>{selected.specs}</div>
                </div>
              </div>
            </div>
            <div style={{ padding: '16px 28px', borderTop: '1px solid #1e2d4a', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setModal(null)}>Close</button>
              <button className="btn-primary" onClick={() => openEdit(selected)}>Edit Product</button>
            </div>
          </div>
        </div>
      )}

      {/* === Delete Product Modal === */}
      {modal === 'delete' && selected && 'sku' in selected && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal-box" style={{ maxWidth: 440 }}>
            <div style={{ padding: '28px', textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#ef4444' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              </div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 18, color: '#e2eaf8', marginBottom: 8 }}>Delete Product?</div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: '#6b7fa8', marginBottom: 24 }}>
                Are you sure you want to delete <strong style={{ color: '#c8d8f0' }}>{selected.name}</strong>? This action cannot be undone.
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button className="btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                <button className="btn-danger" onClick={handleDelete}>Delete Product</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === Add Category Modal === */}
      {modal === 'add-category' && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal-box" style={{ maxWidth: 440 }}>
            <div style={{ padding: '28px', textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(79,142,247,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#4f8ef7' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 18, color: '#e2eaf8', marginBottom: 8 }}>Add Category</div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: '#6b7fa8', marginBottom: 24 }}>
                Enter category name to organize your products.
              </div>
              <input className="admin-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Laptops" style={{ marginBottom: 24 }} />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                <button className="btn-primary" onClick={() => {
                  if (!form.name) return;
                  const newCat: Category = { id: 'CAT-' + String(Date.now()).slice(-6), name: form.name, description: '', productCount: 0 };
                  setCategoriesList([...categoriesList, newCat]);
                  setModal(null);
                  setForm(emptyProduct);
                }}>Add Category</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === Edit Category Modal === */}
      {modal === 'edit-category' && selected && !( 'sku' in selected ) && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal-box" style={{ maxWidth: 440 }}>
            <div style={{ padding: '28px', textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(79,142,247,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#4f8ef7' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 18, color: '#e2eaf8', marginBottom: 8 }}>Edit Category</div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: '#6b7fa8', marginBottom: 24 }}>
                Update category name.
              </div>
              <input className="admin-input" value={selected.name} onChange={e => setSelected({ ...selected, name: e.target.value })} style={{ marginBottom: 24 }} />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                <button className="btn-primary" onClick={() => {
                  setCategoriesList(categoriesList.map(c => c.id === selected.id ? { ...c, name: selected.name } : c));
                  setModal(null);
                  setSelected(null);
                }}>Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}