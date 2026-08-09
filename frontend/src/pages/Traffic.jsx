import { useEffect, useState } from 'react';
import { AlertTriangle, Zap } from 'lucide-react';
import api from '../services/api';
import { usePageTitle } from '../context/PageTitleContext';
import { useToast } from '../context/ToastContext';
import BandwidthChart from '../components/BandwidthChart';
import useTrafficStream from '../hooks/useTrafficStream';
import { formatBytes, timeAgo } from '../utils/format';

export default function Traffic() {
  usePageTitle('Traffic');
  const { push } = useToast();
  const { points } = useTrafficStream(120);
  const [clients, setClients] = useState([]);
  const [statsApi, setStatsApi] = useState(null);
  const [enabling, setEnabling] = useState(false);

  const load = () => {
    api.get('/clients').then((res) => setClients(res.data.clients)).catch(() => {});
    api.get('/stats').then((res) => setStatsApi(res.data.statsApi)).catch(() => {});
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  const enableStats = async () => {
    setEnabling(true);
    try {
      await api.post('/stats/enable-stats-api');
      push('Xray Stats API enabled. Restart Xray from the Xray page to apply.', 'success');
      load();
    } catch (err) {
      push(err.response?.data?.error || 'Failed to enable stats API', 'error');
    } finally {
      setEnabling(false);
    }
  };

  return (
    <div className="space-y-6">
      {statsApi && !statsApi.enabled && (
        <div className="card border-amber-600/40 bg-amber-500/5 p-4 flex items-start gap-3">
          <AlertTriangle className="text-amber-400 mt-0.5 shrink-0" size={18} />
          <div className="text-sm text-amber-200 flex-1">
            <p className="font-medium">Per-client traffic accounting is disabled</p>
            <p className="text-amber-300/80 mt-0.5">
              Xray's built-in Stats API is required to see accurate upload/download totals per client. This adds a
              local-only API inbound and stats/policy blocks to your configuration through the same safe
              validate-and-backup pipeline used everywhere else, then requires an Xray restart.
            </p>
          </div>
          <button className="btn-primary shrink-0" onClick={enableStats} disabled={enabling}>
            <Zap size={15} />
            {enabling ? 'Enabling…' : 'Enable Stats API'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-surface-200 mb-2">Download bandwidth</h3>
          <BandwidthChart data={points} series={[{ key: 'rxSec', name: 'Download', color: '#22d3ee' }]} />
        </div>
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-surface-200 mb-2">Upload bandwidth</h3>
          <BandwidthChart data={points} series={[{ key: 'txSec', name: 'Upload', color: '#a78bfa' }]} />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-800">
          <h3 className="text-sm font-semibold text-surface-200">Per-client traffic</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-800 text-left text-surface-400">
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Upload</th>
                <th className="px-4 py-3 font-medium">Download</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Last seen</th>
                <th className="px-4 py-3 font-medium">Active connections</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-b border-surface-800/60 last:border-0">
                  <td className="px-4 py-3 font-medium text-surface-100">{c.name}</td>
                  <td className="px-4 py-3 text-surface-300">{formatBytes(c.traffic?.uplink)}</td>
                  <td className="px-4 py-3 text-surface-300">{formatBytes(c.traffic?.downlink)}</td>
                  <td className="px-4 py-3 text-surface-300">{formatBytes(c.traffic?.total)}</td>
                  <td className="px-4 py-3 text-surface-400">{timeAgo(c.lastSeen)}</td>
                  <td className="px-4 py-3 text-surface-400">{c.activeConnections || 0}</td>
                </tr>
              ))}
              {clients.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-surface-500">
                    No clients yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {!statsApi?.enabled && (
          <p className="text-xs text-surface-500 px-4 py-3 border-t border-surface-800">
            Traffic values will remain at 0 until the Stats API is enabled above.
          </p>
        )}
      </div>
    </div>
  );
}
