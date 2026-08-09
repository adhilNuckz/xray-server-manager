import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, Eye, Pencil, Link2, Ban, CheckCircle, Trash2, RefreshCw } from 'lucide-react';
import api from '../services/api';
import { usePageTitle } from '../context/PageTitleContext';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/StatusBadge';
import ClientFormModal from '../components/ClientFormModal';
import VlessLinkModal from '../components/VlessLinkModal';
import ClientDetailsModal from '../components/ClientDetailsModal';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatBytes, formatDateOnly, timeAgo } from '../utils/format';

export default function Clients() {
  usePageTitle('Clients');
  const { push } = useToast();

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const [vlessClient, setVlessClient] = useState(null);
  const [detailsClient, setDetailsClient] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'delete'|'enable'|'disable', client }
  const [actionLoading, setActionLoading] = useState(false);

  const fetchClients = useCallback(() => {
    return api
      .get('/clients')
      .then((res) => setClients(res.data.clients))
      .catch(() => push('Failed to load clients', 'error'));
  }, [push]);

  useEffect(() => {
    setLoading(true);
    fetchClients().finally(() => setLoading(false));
    const id = setInterval(fetchClients, 10000);
    return () => clearInterval(id);
  }, [fetchClients]);

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      const matchesSearch =
        !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.email.toLowerCase().includes(search.toLowerCase()) ||
        c.id.includes(search);
      const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [clients, search, statusFilter]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (client) => {
    setEditing(client);
    setFormOpen(true);
  };

  const handleSubmit = async (form) => {
    setSaving(true);
    try {
      const payload = { ...form, expires_at: form.expires_at || null };
      if (editing) {
        await api.put(`/clients/${editing.id}`, payload);
        push('Client updated', 'success');
      } else {
        await api.post('/clients', payload);
        push('Client created', 'success');
      }
      setFormOpen(false);
      await fetchClients();
    } finally {
      setSaving(false);
    }
  };

  const runAction = async () => {
    if (!confirmAction) return;
    setActionLoading(true);
    const { type, client } = confirmAction;
    try {
      if (type === 'delete') {
        await api.delete(`/clients/${client.id}`);
        push('Client deleted', 'success');
      } else if (type === 'enable') {
        await api.post(`/clients/${client.id}/enable`);
        push('Client enabled', 'success');
      } else if (type === 'disable') {
        await api.post(`/clients/${client.id}/disable`);
        push('Client disabled', 'success');
      }
      await fetchClients();
      setConfirmAction(null);
    } catch (err) {
      push(err.response?.data?.error || 'Action failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
            <input
              className="input pl-9"
              placeholder="Search by name, email, or UUID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="input w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="EXPIRING_SOON">Expiring soon</option>
            <option value="EXPIRED">Expired</option>
            <option value="DISABLED">Disabled</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={fetchClients}>
            <RefreshCw size={15} />
          </button>
          <button className="btn-primary" onClick={openCreate}>
            <Plus size={16} />
            New client
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-800 text-left text-surface-400">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">UUID</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3 font-medium">Traffic</th>
                <th className="px-4 py-3 font-medium">Last seen</th>
                <th className="px-4 py-3 font-medium">Conn.</th>
                <th className="px-4 py-3 pr-5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-surface-500">
                    Loading clients…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-surface-500">
                    No clients found.
                  </td>
                </tr>
              )}
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-surface-800/60 last:border-0 hover:bg-surface-800/40">
                  <td className="px-4 py-3 font-medium text-surface-100 whitespace-nowrap">{c.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-surface-400">{c.id.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-surface-300">{c.email}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3 text-surface-400 whitespace-nowrap">{formatDateOnly(c.created_at)}</td>
                  <td className="px-4 py-3 text-surface-400 whitespace-nowrap">
                    {c.expires_at ? formatDateOnly(c.expires_at) : 'Never'}
                  </td>
                  <td className="px-4 py-3 text-surface-400 whitespace-nowrap">{formatBytes(c.traffic?.total)}</td>
                  <td className="px-4 py-3 text-surface-400 whitespace-nowrap">{timeAgo(c.lastSeen)}</td>
                  <td className="px-4 py-3 text-surface-400">{c.activeConnections || 0}</td>
                  <td className="px-4 py-3 pr-5">
                    <div className="flex items-center justify-end gap-1">
                      <IconButton title="View" onClick={() => setDetailsClient(c)}>
                        <Eye size={15} />
                      </IconButton>
                      <IconButton title="Edit" onClick={() => openEdit(c)}>
                        <Pencil size={15} />
                      </IconButton>
                      <IconButton title="VLESS link" onClick={() => setVlessClient(c)}>
                        <Link2 size={15} />
                      </IconButton>
                      {c.enabled ? (
                        <IconButton title="Disable" onClick={() => setConfirmAction({ type: 'disable', client: c })}>
                          <Ban size={15} />
                        </IconButton>
                      ) : (
                        <IconButton title="Enable" onClick={() => setConfirmAction({ type: 'enable', client: c })}>
                          <CheckCircle size={15} />
                        </IconButton>
                      )}
                      <IconButton
                        title="Delete"
                        danger
                        onClick={() => setConfirmAction({ type: 'delete', client: c })}
                      >
                        <Trash2 size={15} />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ClientFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
        initial={editing}
        saving={saving}
      />
      <VlessLinkModal open={Boolean(vlessClient)} onClose={() => setVlessClient(null)} client={vlessClient} />
      <ClientDetailsModal open={Boolean(detailsClient)} onClose={() => setDetailsClient(null)} client={detailsClient} />
      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={
          confirmAction?.type === 'delete'
            ? 'Delete client'
            : confirmAction?.type === 'disable'
            ? 'Disable client'
            : 'Enable client'
        }
        message={
          confirmAction?.type === 'delete'
            ? `Permanently delete "${confirmAction?.client.name}"? This will remove it from the Xray configuration immediately.`
            : confirmAction?.type === 'disable'
            ? `Disable "${confirmAction?.client.name}"? They will no longer be able to connect.`
            : `Enable "${confirmAction?.client.name}"? They will be able to connect again.`
        }
        confirmLabel={confirmAction?.type === 'delete' ? 'Delete' : confirmAction?.type === 'disable' ? 'Disable' : 'Enable'}
        danger={confirmAction?.type !== 'enable'}
        onConfirm={runAction}
        onCancel={() => setConfirmAction(null)}
        loading={actionLoading}
      />
    </div>
  );
}

function IconButton({ children, title, onClick, danger }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`p-1.5 rounded-md hover:bg-surface-700 ${danger ? 'text-red-400 hover:text-red-300' : 'text-surface-400 hover:text-surface-100'}`}
    >
      {children}
    </button>
  );
}
