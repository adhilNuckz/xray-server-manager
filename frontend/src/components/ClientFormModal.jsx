import { useEffect, useState } from 'react';
import Modal from './Modal';
import api from '../services/api';

const emptyForm = { name: '', email: '', expires_at: '', notes: '', flow: 'xtls-rprx-vision', sni: '' };

export default function ClientFormModal({ open, onClose, onSubmit, initial, saving }) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [packs, setPacks] = useState([]);
  const isEdit = Boolean(initial);

  useEffect(() => {
    if (open) {
      api
        .get('/settings')
        .then((res) => {
          const list = res.data.settings.reality_inbounds || [];
          setPacks(list);
          const defaultSni = list[0]?.serverNames?.[0] || '';
          const currentSni = initial?.sni || defaultSni;
          setForm(
            initial
              ? {
                  name: initial.name || '',
                  email: initial.email || '',
                  expires_at: initial.expires_at || '',
                  notes: initial.notes || '',
                  flow: initial.flow || 'xtls-rprx-vision',
                  sni: currentSni,
                }
              : { ...emptyForm, sni: defaultSni }
          );
        })
        .catch(() => {
          setPacks([]);
          setForm(
            initial
              ? {
                  name: initial.name || '',
                  email: initial.email || '',
                  expires_at: initial.expires_at || '',
                  notes: initial.notes || '',
                  flow: initial.flow || 'xtls-rprx-vision',
                  sni: initial.sni || '',
                }
              : emptyForm
          );
        });
      setError('');
    }
  }, [open, initial]);

  const handleChange = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save client');
    }
  };

  const selectedPack = packs.find((p) => (p.serverNames || []).includes(form.sni));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit client' : 'Create new client'}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" type="submit" form="client-form" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create client'}
          </button>
        </>
      }
    >
      <form id="client-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Client name</label>
          <input className="input" value={form.name} onChange={handleChange('name')} placeholder="e.g. John's iPhone" required />
        </div>
        <div>
          <label className="label">Email / identifier</label>
          <input
            className="input"
            value={form.email}
            onChange={handleChange('email')}
            placeholder="e.g. john@example.com"
            required
            disabled={isEdit && initial?.imported}
          />
        </div>
        <div>
          <label className="label">Data pack (Reality inbound)</label>
          <select
            className="input"
            value={form.sni}
            onChange={handleChange('sni')}
            required={packs.length > 0}
          >
            {packs.length === 0 && <option value="">No Reality packs configured</option>}
            {packs.flatMap((p) =>
              (p.serverNames || []).map((sni) => (
                <option key={`${p.id}-${sni}`} value={sni}>
                  {p.label} — port {p.port} — {sni}
                </option>
              ))
            )}
          </select>
          {selectedPack && (
            <p className="text-xs text-surface-500 mt-1">
              Link will use port <span className="font-mono text-surface-300">{selectedPack.port}</span>, dest{' '}
              <span className="font-mono text-surface-300">{selectedPack.dest}</span>
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Expiration date (optional)</label>
            <input type="date" className="input" value={form.expires_at || ''} onChange={handleChange('expires_at')} />
          </div>
          <div>
            <label className="label">Flow</label>
            <select className="input" value={form.flow} onChange={handleChange('flow')}>
              <option value="xtls-rprx-vision">xtls-rprx-vision</option>
              <option value="none">none</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">Notes (optional)</label>
          <textarea className="input min-h-[70px]" value={form.notes} onChange={handleChange('notes')} maxLength={500} />
        </div>
        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-3 py-2">{error}</div>
        )}
      </form>
    </Modal>
  );
}
