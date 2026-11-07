import { useEffect, useMemo, useState } from 'react';
import { subscribeCategories, saveCategory, updateCategory, deleteCategory, friendlyFirebaseError, subscribeProductsFromFirestore } from '../store/firestoreSync';

type Category = { id: string; name: string; description: string; image: string; active: boolean };

export default function Categories({ searchQuery }: { searchQuery: string }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [modal, setModal] = useState<null | 'add' | 'edit' | 'delete'>(null);
  const [selected, setSelected] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', description: '', image: '', active: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsub = subscribeCategories((rows) => setCategories(rows.map((r: any) => ({ id: r.id, name: String(r.name||''), description: String(r.description||''), image: String(r.image||''), active: r.active !== false }))));
    const unsubP = subscribeProductsFromFirestore(setProducts);
    return () => { unsub(); unsubP(); };
  }, []);

  const filtered = useMemo(() => categories.filter(c => {
    const q = searchQuery.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
  }), [categories, searchQuery]);

  const productCount = (catName: string) => products.filter(p => String(p.category||'') === catName).length;

  const openEdit = (c: Category) => {
    setSelected(c);
    setForm({ name: c.name, description: c.description, image: c.image, active: c.active });
    setError(''); setModal('edit');
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Category name is required.'); return; }
    setBusy(true); setError('');
    try {
      if (modal === 'add') await saveCategory(form);
      else if (selected) await updateCategory(selected.id, form);
      setModal(null);
    } catch (e) { setError(friendlyFirebaseError(e)); }
    finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setBusy(true); setError('');
    try { await deleteCategory(selected.id); setModal(null); }
    catch (e) { setError(friendlyFirebaseError(e)); }
    finally { setBusy(false); }
  };

  const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div><label className="form-label">{label}</label>{children}</div>
  );

  return (
    <div className="page-fade" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#4b5e82' }}>{filtered.length} categories (Firestore: categories)</span>
        <button className="btn-primary" onClick={() => { setForm({ name: '', description: '', image: '', active: true }); setError(''); setModal('add'); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Category
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {filtered.map(c => (
          <div key={c.id} className="admin-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src={c.image || 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=60&h=60&fit=crop&auto=format'} alt={c.name} style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover', background: '#1a2540', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 15, fontWeight: 700, color: '#e2eaf8' }}>{c.name}</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#4b5e82' }}>{c.id}</div>
              </div>
              <span className={'badge ' + (c.active ? 'badge-success' : 'badge-neutral')}>{c.active ? 'Active' : 'Inactive'}</span>
            </div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#6b7fa8' }}>{c.description || '—'}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid #1e2d4a' }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#4f8ef7' }}><span style={{ fontWeight: 700 }}>{productCount(c.name)}</span><span style={{ color: '#4b5e82' }}> products</span></div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn-ghost btn-sm" onClick={() => openEdit(c)}>Edit</button>
                <button className="btn-danger btn-sm" onClick={() => { setSelected(c); setError(''); setModal('delete'); }}>Delete</button>
              </div>
            </div>
          </div>
        ))}
        {!filtered.length && <div style={{ gridColumn: '1 / -1', color: '#6b7fa8', fontFamily: 'Inter, sans-serif', padding: 24 }} className="admin-card">No categories yet. Add one to auto-create the Firestore <code>categories</code> collection.</div>}
      </div>

      {(modal === 'add' || modal === 'edit') && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal-box" style={{ maxWidth: 480 }}>
            <div style={{ padding: '22px 28px 18px', borderBottom: '1px solid #1e2d4a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 18, color: '#e2eaf8' }}>{modal === 'add' ? 'Add Category' : 'Edit Category'}</div>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', color: '#4b5e82', cursor: 'pointer' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
            <div style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {error && <div style={{ color: '#fca5a5', fontSize: 13, background: 'rgba(239,68,68,.12)', padding: '8px 10px', borderRadius: 8 }}>{error}</div>}
              <F label="Category Name"><input className="admin-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Laptops" /></F>
              <F label="Description"><textarea className="admin-input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Brief description..." /></F>
              <F label="Image URL"><input className="admin-input" value={form.image} onChange={e => setForm({ ...form, image: e.target.value })} placeholder="https://..." /></F>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Active</label>
                <button onClick={() => setForm({ ...form, active: !form.active })} style={{ position: 'relative', width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: form.active ? '#4f8ef7' : '#1e2d4a', transition: 'background 0.2s' }}>
                  <div style={{ position: 'absolute', top: 3, left: form.active ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                </button>
              </div>
            </div>
            <div style={{ padding: '16px 28px', borderTop: '1px solid #1e2d4a', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn-primary" disabled={busy} onClick={handleSave}>{busy ? 'Saving…' : modal === 'add' ? 'Add Category' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {modal === 'delete' && selected && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal-box" style={{ maxWidth: 420 }}>
            <div style={{ padding: '28px', textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#ef4444', fontSize: 24 }}>🗑</div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 18, color: '#e2eaf8', marginBottom: 8 }}>Delete Category?</div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: '#6b7fa8', marginBottom: 24 }}>Delete <strong style={{ color: '#c8d8f0' }}>{selected.name}</strong>? This cannot be undone.</div>
              {error && <div style={{ color: '#fca5a5', fontSize: 13, marginBottom: 12 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button className="btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                <button className="btn-danger" disabled={busy} onClick={handleDelete}>{busy ? 'Deleting…' : 'Delete'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
