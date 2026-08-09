import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import api from '../services/api';
import { usePageTitle } from '../context/PageTitleContext';
import { formatDate } from '../utils/format';

export default function Connections() {
  usePageTitle('Connections');
  const [data, setData] = useState({ connections: [], accessLogAvailable: false, accessLogPath: null });

  const load = () => api.get('/connections').then((res) => setData(res.data)).catch(() => {});

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-4">
      {!data.accessLogAvailable && (
        <div className="card border-amber-600/40 bg-amber-500/5 p-4 flex items-start gap-3">
          <AlertTriangle className="text-amber-400 mt-0.5 shrink-0" size={18} />
          <div className="text-sm text-amber-200">
            <p className="font-medium">Connection monitoring requires Xray's access log</p>
            <p className="text-amber-300/80 mt-0.5">
              Xray only exposes which client (email/UUID) owns a connection through its access log. Enable it from
              the Xray Configuration page ("Enable Access Log") to populate this view.
            </p>
          </div>
        </div>
      )}

      <div className="card p-4 text-xs text-surface-500">
        This view reflects connection events parsed from Xray's access log
        {data.accessLogPath ? ` (${data.accessLogPath})` : ''}. It is a best-effort, log-based mechanism — Xray-core
        does not expose a live authoritative connection table via its API. See the README for details on this
        limitation.
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-800 text-left text-surface-400">
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Email / UUID</th>
                <th className="px-4 py-3 font-medium">Source IP</th>
                <th className="px-4 py-3 font-medium">Destination</th>
                <th className="px-4 py-3 font-medium">State</th>
              </tr>
            </thead>
            <tbody>
              {data.connections.map((c) => (
                <tr key={c.id} className="border-b border-surface-800/60 last:border-0">
                  <td className="px-4 py-3 text-surface-400 whitespace-nowrap">{formatDate(c.ts)}</td>
                  <td className="px-4 py-3 text-surface-100 font-medium">{c.clientName || '—'}</td>
                  <td className="px-4 py-3 text-surface-400 font-mono text-xs">{c.email || '—'}</td>
                  <td className="px-4 py-3 text-surface-300">{c.source_ip}</td>
                  <td className="px-4 py-3 text-surface-300">{c.destination}</td>
                  <td className="px-4 py-3 text-surface-400">{c.state}</td>
                </tr>
              ))}
              {data.connections.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-surface-500">
                    No connection events recorded yet.
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
