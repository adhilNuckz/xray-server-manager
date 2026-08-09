import { useEffect, useState } from 'react';
import Modal from './Modal';

const emptyForm = { name: '', email: '', expires_at: '', notes: '', flow: 'xtls-rprx-vision' };

export default function ClientFormModal({ open, onClose, onSubmit, initial, saving }) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const isEdit = Boolean(initial);

  useEffect(() => {
    if (open) {
      setForm(
        initial
          ? {
              name: initial.name || '',
              email: initial.email || '',
              expires_at: initial.expires_at || '',
              notes: initial.notes || '',
              flow: initial.flow || 'xtls-rprx-vision',
            }
          : emptyForm
      );
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
        {form.expires_at === '' && (
          <p className="text-xs text-surface-500">No expiration date means this client never expires.</p>
        )}
        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-3 py-2">{error}</div>
        )}
      </form>
    </Modal>
  );
}
