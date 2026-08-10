import { useEffect, useState } from 'react';
import { Save, KeyRound, ScrollText, Plus, Trash2 } from 'lucide-react';
import api from '../services/api';
import { usePageTitle } from '../context/PageTitleContext';
import { useToast } from '../context/ToastContext';
import { formatDate } from '../utils/format';

const emptyPack = () => ({
  id: '',
  label: '',
  port: '',
  dest: '',
  serverNamesText: '',
});

function packsFromSettings(list) {
  return (list || []).map((p) => ({
    id: p.id || '',
    label: p.label || '',
    port: String(p.port || ''),
    dest: p.dest || '',
    serverNamesText: (p.serverNames || []).join(', '),
  }));
}

function packsToPayload(packs) {
  return packs.map((p) => ({
    id: p.id || undefined,
    label: p.label.trim(),
    port: Number(p.port),
    dest: p.dest.trim(),
    serverNames: p.serverNamesText
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  }));
}

export default function Settings() {
  usePageTitle('Settings');
  const { push } = useToast();

  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({
    server_address: '',
    default_flow: 'xtls-rprx-vision',
    max_connections_per_client: '1',
  });
  const [packs, setPacks] = useState([]);
  const [presets, setPresets] = useState([]);
  const [savingSettings, setSavingSettings] = useState(false);

  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [savingPw, setSavingPw] = useState(false);

  const [logs, setLogs] = useState([]);

  const loadSettings = () =>
    api.get('/settings').then((res) => {
      setSettings(res.data.settings);
      setForm({
        server_address: res.data.settings.server_address || '',
        default_flow: res.data.settings.default_flow,
        max_connections_per_client: res.data.settings.max_connections_per_client,
      });
      setPacks(packsFromSettings(res.data.settings.reality_inbounds));
      setPresets(res.data.settings.reality_presets || []);
    });

  const loadLogs = () => api.get('/audit?limit=100').then((res) => setLogs(res.data.logs));

  useEffect(() => {
    loadSettings().catch(() => {});
    loadLogs().catch(() => {});
  }, []);

  const updatePack = (idx, key, value) => {
    setPacks((list) => list.map((p, i) => (i === idx ? { ...p, [key]: value } : p)));
  };

  const addPack = () => setPacks((list) => [...list, emptyPack()]);

  const addPreset = (preset) => {
    if (packs.some((p) => p.id === preset.id || Number(p.port) === preset.port)) {
      push('That pack or port is already in the list', 'error');
      return;
    }
    setPacks((list) => [
      ...list,
      {
        id: preset.id,
        label: preset.label,
        port: String(preset.port),
        dest: preset.dest,
        serverNamesText: (preset.serverNames || []).join(', '),
      },
    ]);
  };

  const removePack = (idx) => setPacks((list) => list.filter((_, i) => i !== idx));

  const saveSettings = async (e) => {
    e.preventDefault();
    if (!packs.length) {
      push('Add at least one Reality inbound / data pack', 'error');
      return;
    }
    setSavingSettings(true);
    try {
      const res = await api.put('/settings', {
        ...form,
        reality_inbounds: packsToPayload(packs),
      });
      push(
        res.data.realitySync?.synced
          ? 'Settings saved — separate Reality inbounds synced to Xray'
          : 'Settings saved',
        'success'
      );
      if (res.data.realitySync?.reloadError) {
        push(res.data.realitySync.reloadError, 'error');
      }
      await loadSettings();
    } catch (err) {
      push(err.response?.data?.error || 'Failed to save settings', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      push('New passwords do not match', 'error');
      return;
    }
    setSavingPw(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      push('Password changed successfully', 'success');
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      push(err.response?.data?.error || 'Failed to change password', 'error');
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <form onSubmit={saveSettings} className="card p-5 space-y-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-surface-200">Panel settings</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Panel port</label>
              <input className="input" value={settings?.panel_port ?? ''} disabled />
              <p className="text-xs text-surface-500 mt-1">Change via PANEL_PORT in .env and restart PM2.</p>
            </div>
            <div>
              <label className="label">Server address (VLESS links)</label>
              <input
                className="input"
                value={form.server_address}
                onChange={(e) => setForm((f) => ({ ...f, server_address: e.target.value }))}
                placeholder="e.g. vpn.solitways.online"
              />
            </div>
            <div>
              <label className="label">Default client flow</label>
              <select
                className="input"
                value={form.default_flow}
                onChange={(e) => setForm((f) => ({ ...f, default_flow: e.target.value }))}
              >
                <option value="xtls-rprx-vision">xtls-rprx-vision</option>
                <option value="none">none</option>
              </select>
            </div>
          </div>

          <div className="max-w-md">
            <label className="label">Maximum simultaneous connections per client</label>
            <select
              className="input"
              value={form.max_connections_per_client}
              onChange={(e) => setForm((f) => ({ ...f, max_connections_per_client: e.target.value }))}
            >
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="5">5</option>
              <option value="unlimited">Unlimited</option>
            </select>
          </div>

          <div className="pt-4 border-t border-surface-800 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-surface-200">Reality inbounds (data packs)</h4>
                <p className="text-xs text-surface-500 mt-1 max-w-2xl">
                  Each pack is a <span className="text-surface-300">separate Reality inbound</span> with its own
                  port, destination, and server names. Dest and SNI must match the same site family (e.g. Zoom
                  dest + Zoom SNI). Saving rewrites Reality inbounds in Xray and reloads the service. Open new
                  ports in AWS Security Group / UFW.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {presets.map((p) => (
                  <button key={p.id} type="button" className="btn-secondary text-xs" onClick={() => addPreset(p)}>
                    + {p.label}
                  </button>
                ))}
                <button type="button" className="btn-secondary text-xs" onClick={addPack}>
                  <Plus size={14} /> Custom
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {packs.map((pack, idx) => (
                <div key={`${pack.id}-${idx}`} className="rounded-xl border border-surface-700 bg-surface-850/40 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-surface-100">Pack #{idx + 1}</p>
                    <button
                      type="button"
                      className="text-surface-500 hover:text-red-400 p-1"
                      onClick={() => removePack(idx)}
                      disabled={packs.length <= 1}
                      title="Remove pack"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label className="label">Label</label>
                      <input
                        className="input"
                        value={pack.label}
                        onChange={(e) => updatePack(idx, 'label', e.target.value)}
                        placeholder="Zoom"
                        required
                      />
                    </div>
                    <div>
                      <label className="label">Port</label>
                      <input
                        className="input font-mono"
                        value={pack.port}
                        onChange={(e) => updatePack(idx, 'port', e.target.value)}
                        placeholder="443"
                        required
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="label">Destination (dest)</label>
                      <input
                        className="input font-mono text-sm"
                        value={pack.dest}
                        onChange={(e) => updatePack(idx, 'dest', e.target.value)}
                        placeholder="support.zoom.us:443"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label">Server names / SNI (comma-separated)</label>
                    <input
                      className="input font-mono text-sm"
                      value={pack.serverNamesText}
                      onChange={(e) => updatePack(idx, 'serverNamesText', e.target.value)}
                      placeholder="support.zoom.us"
                      required
                    />
                    <p className="text-xs text-surface-500 mt-1">
                      Must belong to the same site as dest. Clients picking this pack get links on port{' '}
                      <span className="font-mono text-surface-300">{pack.port || '—'}</span>.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs text-surface-500 pt-2 border-t border-surface-800">
            <div>
              <p className="text-surface-400">Xray binary</p>
              <p className="font-mono text-surface-300 break-all">{settings?.xray_binary}</p>
            </div>
            <div>
              <p className="text-surface-400">Xray config</p>
              <p className="font-mono text-surface-300 break-all">{settings?.xray_config}</p>
            </div>
          </div>

          <button className="btn-primary" type="submit" disabled={savingSettings}>
            <Save size={15} /> {savingSettings ? 'Saving…' : 'Save settings & sync Xray'}
          </button>
        </form>

        <form onSubmit={changePassword} className="card p-5 space-y-4 lg:col-span-2 max-w-xl">
          <h3 className="text-sm font-semibold text-surface-200 flex items-center gap-2">
            <KeyRound size={15} /> Change admin password
          </h3>
          <div>
            <label className="label">Current password</label>
            <input
              type="password"
              className="input"
              value={pwForm.currentPassword}
              onChange={(e) => setPwForm((f) => ({ ...f, currentPassword: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="label">New password</label>
            <input
              type="password"
              className="input"
              value={pwForm.newPassword}
              onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))}
              minLength={8}
              required
            />
          </div>
          <div>
            <label className="label">Confirm new password</label>
            <input
              type="password"
              className="input"
              value={pwForm.confirmPassword}
              onChange={(e) => setPwForm((f) => ({ ...f, confirmPassword: e.target.value }))}
              minLength={8}
              required
            />
          </div>
          <p className="text-xs text-surface-500">
            Admin username: <span className="font-mono text-surface-300">{settings?.admin_username}</span>
          </p>
          <button className="btn-primary" type="submit" disabled={savingPw}>
            {savingPw ? 'Saving…' : 'Change password'}
          </button>
        </form>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-800 flex items-center gap-2">
          <ScrollText size={15} className="text-surface-400" />
          <h3 className="text-sm font-semibold text-surface-200">Audit log</h3>
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-900">
              <tr className="border-b border-surface-800 text-left text-surface-400">
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Details</th>
                <th className="px-4 py-3 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-surface-800/60 last:border-0">
                  <td className="px-4 py-3 text-surface-400 whitespace-nowrap">{formatDate(l.ts)}</td>
                  <td className="px-4 py-3 text-surface-100">{l.actor}</td>
                  <td className="px-4 py-3 text-surface-300">{l.action.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-surface-500 font-mono text-xs max-w-xs truncate">
                    {l.details ? JSON.stringify(l.details) : ''}
                  </td>
                  <td className="px-4 py-3 text-surface-500">{l.ip || '—'}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-surface-500">
                    No audit entries yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
