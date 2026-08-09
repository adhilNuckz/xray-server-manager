import { useEffect, useState } from 'react';
import { Archive, Eye, RotateCcw, Trash2, Plus } from 'lucide-react';
import api from '../services/api';
import { usePageTitle } from '../context/PageTitleContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import JsonViewer from '../components/JsonViewer';
import { formatBytes, formatDate } from '../utils/format';

export default function Backups() {
  usePageTitle('Backups');
  const { push } = useToast();
  const [backups, setBackups] = useState([]);
  const [viewing, setViewing] = useState(null); // { id, content }
  const [confirmAction, setConfirmAction] = useState(null); // { type, backup }
  const [busy, setBusy] = useState(false);

  const load = () => api.get('/backups').then((res) => setBackups(res.data.backups)).catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const createBackup = async () => {
    setBusy(true);
    try {
      await api.post('/backups');
      push('Backup created', 'success');
      await load();
    } catch (err) {
      push(err.response?.data?.error || 'Failed to create backup', 'error');
    } finally {
      setBusy(false);
    }
  };

  const view = async (backup) => {
    try {
      const res = await api.get(`/backups/${backup.id}`);
      setViewing(res.data);
    } catch (err) {
      push(err.response?.data?.error || 'Failed to load backup', 'error');
    }
  };

  const runAction = async () => {
    if (!confirmAction) return;
    setBusy(true);
    try {
      if (confirmAction.type === 'restore') {
        await api.post(`/backups/${confirmAction.backup.id}/restore`);
        push('Backup restored. A new backup of the previous config was created automatically.', 'success');
      } else if (confirmAction.type === 'delete') {
        await api.delete(`/backups/${confirmAction.backup.id}`);
        push('Backup deleted', 'success');
      }
      await load();
      setConfirmAction(null);
    } catch (err) {
      push(err.response?.data?.error || 'Action failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-surface-400">
          A backup is created automatically before every configuration change. You can also create one manually.
        </p>
        <button className="btn-primary" onClick={createBackup} disabled={busy}>
          <Plus size={15} /> Create backup
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-800 text-left text-surface-400">
                <th className="px-4 py-3 font-medium">Filename</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Size</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.id} className="border-b border-surface-800/60 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-surface-200">
                    <span className="flex items-center gap-2">
                      <Archive size={14} className="text-surface-500" />
                      {b.filename}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-surface-400 whitespace-nowrap">{formatDate(b.createdAt)}</td>
                  <td className="px-4 py-3 text-surface-400">{formatBytes(b.size)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button className="p-1.5 rounded-md hover:bg-surface-700 text-surface-400 hover:text-surface-100" title="View" onClick={() => view(b)}>
                        <Eye size={15} />
                      </button>
                      <button
                        className="p-1.5 rounded-md hover:bg-surface-700 text-surface-400 hover:text-surface-100"
                        title="Restore"
                        onClick={() => setConfirmAction({ type: 'restore', backup: b })}
                      >
                        <RotateCcw size={15} />
                      </button>
                      <button
                        className="p-1.5 rounded-md hover:bg-surface-700 text-red-400 hover:text-red-300"
                        title="Delete"
                        onClick={() => setConfirmAction({ type: 'delete', backup: b })}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {backups.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-surface-500">
                    No backups yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title={viewing?.id} width="max-w-2xl">
        {viewing && <JsonViewer value={viewing.content} />}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.type === 'restore' ? 'Restore backup' : 'Delete backup'}
        message={
          confirmAction?.type === 'restore'
            ? 'This will replace the live Xray configuration with this backup (after validation) and restart the process to pick it up manually from the Xray page.'
            : 'This will permanently delete this backup file. This cannot be undone.'
        }
        confirmLabel={confirmAction?.type === 'restore' ? 'Restore' : 'Delete'}
        onConfirm={runAction}
        onCancel={() => setConfirmAction(null)}
        loading={busy}
      />
    </div>
  );
}
