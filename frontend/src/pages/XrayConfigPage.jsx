import { useEffect, useState } from 'react';
import { ShieldAlert, Play, Square, RotateCw, RefreshCcw, CheckCircle2, Save, Pencil, X, Archive } from 'lucide-react';
import api from '../services/api';
import { usePageTitle } from '../context/PageTitleContext';
import { useToast } from '../context/ToastContext';
import JsonViewer from '../components/JsonViewer';
import ConfirmDialog from '../components/ConfirmDialog';

export default function XrayConfigPage() {
  usePageTitle('Xray');
  const { push } = useToast();

  const [status, setStatus] = useState(null);
  const [configText, setConfigText] = useState('');
  const [redacted, setRedacted] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [confirmEdit, setConfirmEdit] = useState(false);
  const [confirmService, setConfirmService] = useState(null); // 'start'|'stop'|'restart'|'reload'
  const [validation, setValidation] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadStatus = () => api.get('/xray/status').then((res) => setStatus(res.data)).catch(() => {});
  const loadConfig = () =>
    api
      .get('/xray/config')
      .then((res) => {
        setConfigText(JSON.stringify(res.data.config, null, 2));
        setRedacted(res.data.redacted);
      })
      .catch((err) => push(err.response?.data?.error || 'Failed to load configuration', 'error'));

  useEffect(() => {
    loadStatus();
    loadConfig();
    const id = setInterval(loadStatus, 10000);
    return () => clearInterval(id);
  }, []);

  const runServiceAction = async (action) => {
    setBusy(true);
    try {
      const res = await api.post(`/xray/${action}`);
      push(`Xray ${action} ${res.data.code === 0 || res.data.active !== undefined ? 'succeeded' : 'completed'}`, 'success');
      await loadStatus();
    } catch (err) {
      push(err.response?.data?.error || `Failed to ${action} Xray`, 'error');
    } finally {
      setBusy(false);
      setConfirmService(null);
    }
  };

  const enterEditMode = async () => {
    setConfirmEdit(false);
    try {
      const res = await api.get('/xray/config?reveal=true');
      setEditContent(JSON.stringify(res.data.config, null, 2));
      setEditMode(true);
    } catch (err) {
      push(err.response?.data?.error || 'Failed to load configuration for editing', 'error');
    }
  };

  const cancelEdit = () => {
    setEditMode(false);
    setEditContent('');
    setValidation(null);
  };

  const validate = async () => {
    setBusy(true);
    try {
      const res = await api.post('/xray/validate', { content: editContent });
      setValidation(res.data);
      push(res.data.valid ? 'Configuration is valid' : 'Configuration is invalid', res.data.valid ? 'success' : 'error');
    } catch (err) {
      push(err.response?.data?.error || 'Validation failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.put('/xray/config', { content: editContent });
      push('Configuration saved. Restart Xray to apply changes.', 'success');
      setEditMode(false);
      setValidation(null);
      await loadConfig();
    } catch (err) {
      if (err.response?.data?.validation) {
        setValidation(err.response.data.validation);
      }
      push(err.response?.data?.error || 'Failed to save configuration', 'error');
    } finally {
      setBusy(false);
    }
  };

  const createBackup = async () => {
    setBusy(true);
    try {
      await api.post('/backups');
      push('Backup created', 'success');
    } catch (err) {
      push(err.response?.data?.error || 'Failed to create backup', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`h-2.5 w-2.5 rounded-full ${status?.active ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}
          />
          <div>
            <p className="text-sm font-medium text-surface-100">
              Xray is {status?.active ? 'running' : 'stopped'}
              {status?.mainPid ? ` (PID ${status.mainPid})` : ''}
            </p>
            <p className="text-xs text-surface-500">Service: {status?.state || 'unknown'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" disabled={busy} onClick={() => setConfirmService('start')}>
            <Play size={14} /> Start
          </button>
          <button className="btn-secondary" disabled={busy} onClick={() => setConfirmService('stop')}>
            <Square size={14} /> Stop
          </button>
          <button className="btn-secondary" disabled={busy} onClick={() => setConfirmService('restart')}>
            <RotateCw size={14} /> Restart
          </button>
          <button className="btn-secondary" disabled={busy} onClick={() => setConfirmService('reload')}>
            <RefreshCcw size={14} /> Reload
          </button>
        </div>
      </div>

      <div className="card">
        <div className="px-4 py-3 border-b border-surface-800 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-semibold text-surface-200">Xray configuration</h3>
            <p className="text-xs text-surface-500">{status ? '' : ''}/usr/local/etc/xray/config.json</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={createBackup} disabled={busy}>
              <Archive size={14} /> Backup now
            </button>
            {!editMode ? (
              <button className="btn-secondary" onClick={() => setConfirmEdit(true)}>
                <Pencil size={14} /> Enable editing
              </button>
            ) : (
              <>
                <button className="btn-secondary" onClick={validate} disabled={busy}>
                  <CheckCircle2 size={14} /> Validate
                </button>
                <button className="btn-primary" onClick={save} disabled={busy}>
                  <Save size={14} /> Save config
                </button>
                <button className="btn-ghost" onClick={cancelEdit} disabled={busy}>
                  <X size={14} /> Cancel
                </button>
              </>
            )}
          </div>
        </div>

        <div className="p-4 space-y-3">
          {!editMode && redacted && (
            <p className="text-xs text-amber-400 flex items-center gap-1.5">
              <ShieldAlert size={13} /> Private keys and passwords are redacted in this view.
            </p>
          )}

          {editMode ? (
            <>
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 flex items-start gap-2">
                <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                Editing raw configuration can break Xray if invalid. Changes are validated with{' '}
                <code className="font-mono">xray run -test</code> before being applied, and a backup is created
                automatically, but always double-check your changes.
              </div>
              <textarea
                className="input font-mono text-xs min-h-[50vh]"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                spellCheck={false}
              />
              {validation && (
                <div
                  className={`text-xs rounded-lg p-3 font-mono whitespace-pre-wrap ${
                    validation.valid
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                      : 'bg-red-500/10 border border-red-500/30 text-red-300'
                  }`}
                >
                  {validation.output || (validation.valid ? 'Valid configuration' : 'Invalid configuration')}
                </div>
              )}
            </>
          ) : (
            <JsonViewer value={configText} />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmEdit}
        title="Enable raw configuration editing"
        message="This will reveal private keys and secrets in the editor so you can safely edit and save the full configuration. Make sure nobody else can see your screen. Continue?"
        confirmLabel="Show & edit"
        danger={false}
        onConfirm={enterEditMode}
        onCancel={() => setConfirmEdit(false)}
      />

      <ConfirmDialog
        open={Boolean(confirmService)}
        title={`${confirmService ? confirmService[0].toUpperCase() + confirmService.slice(1) : ''} Xray`}
        message={`Are you sure you want to ${confirmService} the Xray service? This affects all connected clients.`}
        confirmLabel="Confirm"
        onConfirm={() => runServiceAction(confirmService)}
        onCancel={() => setConfirmService(null)}
        loading={busy}
      />
    </div>
  );
}
