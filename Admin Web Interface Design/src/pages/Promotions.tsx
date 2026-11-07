import { useEffect, useState } from 'react';
import { subscribePromotions, savePromotion, updatePromotion, deletePromotion, friendlyFirebaseError } from '../store/firestoreSync';

const empty = { title: '', description: '', discountType: 'percent', discountValue: 0, code: '', active: true, startDate: '', endDate: '' };
type Promo = typeof empty & { id: string };

export default function Promotions() {
  const [rows, setRows] = useState<Promo[]>([]);
  const [modal, setModal] = useState<null | 'add' | 'edit' | 'delete'>(null);
  const [selected, setSelected] = useState<Promo | null>(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => subscribePromotions((r) => setRows(r.map((x: any) => ({ id: x.id, title: String(x.title||''), description: String(x.description||''), discountType: String(x.discountType||'percent'), discountValue: Number(x.discountValue)||0, code: String(x.code||''), active: x.active !== false, startDate: String(x.startDate||''), endDate: String(x.endDate||'') })))), []);

  const save = async () => {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    setBusy(true); setError('');
    try {
      if (modal === 'add') await savePromotion(form);
      else if (selected) await updatePromotion(selected.id, form);
      setModal(null);
    } catch (e) { setError(friendlyFirebaseError(e)); } finally { setBusy(false); }
  };
  const del = async () => {
    if (!selected) return; setBusy(true); setError('');
    try { await deletePromotion(selected.id); setModal(null); } catch (e) { setError(friendlyFirebaseError(e)); } finally { setBusy(false); }
  };
  const F = ({ label, children }: { label: string; children: React.ReactNode }) => <div><label className="form-label">{label}</label>{children}</div>;

  return (
    <div className="page-fade" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#4b5e82' }}>{rows.length} promotions (Firestore: promotions)</span>
        <button className="btn-primary" onClick={() => { setForm(empty); setError(''); setModal('add'); }}>Add Promotion</button>
      </div>
      <div className="admin-card" style={{ overflow: 'hidden' }}>
        <table className="data-table"><thead><tr><th>Title</th><th>Code</th><th>Discount</th><th>Dates</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.id}>
              <td><div style={{ fontWeight: 600, color: '#c8d8f0' }}>{r.title}</div><div style={{ fontSize: 11, color: '#6b7fa8' }}>{r.description}</div></td>
              <td><span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#4f8ef7' }}>{r.code || '—'}</span></td>
              <td style={{ color: '#e2eaf8' }}>{r.discountValue}{r.discountType === 'percent' ? '%' : ' PHP'}</td>
              <td style={{ fontSize: 12, color: '#8b9fc8' }}>{r.startDate || '—'} → {r.endDate || '—'}</td>
              <td><span className={'badge ' + (r.active ? 'badge-success' : 'badge-neutral')}>{r.active ? 'Active' : 'Inactive'}</span></td>
              <td><div style={{ display: 'flex', gap: 6 }}><button className="btn-ghost btn-sm" onClick={() => { setSelected(r); setForm({ title:r.title,description:r.description,discountType:r.discountType,discountValue:r.discountValue,code:r.code,active:r.active,startDate:r.startDate,endDate:r.endDate }); setError(''); setModal('edit'); }}>Edit</button><button className="btn-danger btn-sm" onClick={() => { setSelected(r); setModal('delete'); }}>Delete</button></div></td>
            </tr>
          ))}{!rows.length && <tr><td colSpan={6} style={{ padding: 24, color: '#6b7fa8' }}>No promotions yet. Admin can add one; Firestore creates the <code>promotions</code> collection automatically.</td></tr>}</tbody></table>
      </div>

      {(modal === 'add' || modal === 'edit') && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal-box" style={{ maxWidth: 520 }}>
            <div style={{ padding: '22px 28px 18px', borderBottom: '1px solid #1e2d4a', display: 'flex', justifyContent: 'space-between' }}><div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 18, color: '#e2eaf8' }}>{modal === 'add' ? 'Add Promotion' : 'Edit Promotion'}</div><button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', color: '#4b5e82', cursor: 'pointer' }}>✕</button></div>
            <div style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {error && <div style={{ color: '#fca5a5', fontSize: 13 }}>{error}</div>}
              <F label="Title"><input className="admin-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></F>
              <F label="Description"><textarea className="admin-input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></F>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <F label="Code"><input className="admin-input" value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="SAVE10" /></F>
                <F label="Type"><select className="admin-input" value={form.discountType} onChange={e => setForm({ ...form, discountType: e.target.value })}><option value="percent">Percent</option><option value="fixed">Fixed (PHP)</option></select></F>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <F label="Discount Value"><input className="admin-input" type="number" value={form.discountValue} onChange={e => setForm({ ...form, discountValue: Number(e.target.value) })} /></F>
                <F label="Start Date"><input className="admin-input" type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} /></F>
                <F label="End Date"><input className="admin-input" type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} /></F>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#c8d8f0', fontSize: 13 }}><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> Active</label>
            </div>
            <div style={{ padding: '16px 28px', borderTop: '1px solid #1e2d4a', display: 'flex', gap: 10, justifyContent: 'flex-end' }}><button className="btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></div>
          </div>
        </div>
      )}
      {modal === 'delete' && selected && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}><div className="modal-box" style={{ maxWidth: 420 }}><div style={{ padding: 28, textAlign: 'center' }}><div style={{ color: '#e2eaf8', fontWeight: 700, marginBottom: 8 }}>Delete promotion?</div><div style={{ color: '#6b7fa8', marginBottom: 18 }}>{selected.title}</div>{error && <div style={{ color: '#fca5a5', marginBottom: 10 }}>{error}</div>}<div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}><button className="btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn-danger" disabled={busy} onClick={del}>{busy ? 'Deleting…' : 'Delete'}</button></div></div></div></div>
      )}
    </div>
  );
}
