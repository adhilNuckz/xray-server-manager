import { useEffect, useState, useRef } from 'react';
import { Play, Pause, RefreshCw, Filter, X, ArrowUpRight, Search, ShieldCheck } from 'lucide-react';
import api from '../services/api';
import { formatDate } from '../utils/format';

export default function RealtimeConnectionLog({ selectedIp, onClearIpFilter }) {
  const [connections, setConnections] = useState([]);
  const [search, setSearch] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [limit, setLimit] = useState(50);
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  const fetchLogs = () => {
    if (isPausedRef.current) return;
    setRefreshing(true);
    const params = new URLSearchParams({ limit: String(limit) });
    if (selectedIp) params.append('ip', selectedIp);

    api
      .get(`/connections?${params.toString()}`)
      .then((res) => {
        setConnections(res.data.connections || []);
        setRefreshing(false);
      })
      .catch(() => setRefreshing(false));
  };

  useEffect(() => {
    fetchLogs();
    const id = setInterval(() => {
      fetchLogs();
    }, 3000);
    return () => clearInterval(id);
  }, [selectedIp, limit]);

  const filteredConnections = connections.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (c.clientName && c.clientName.toLowerCase().includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.source_ip && c.source_ip.toLowerCase().includes(q)) ||
      (c.destination && c.destination.toLowerCase().includes(q))
    );
  });

  return (
    <div className="card p-4 flex flex-col h-full">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-surface-800">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-accent-400" />
          <h3 className="text-sm font-semibold text-surface-100">Real-Time Connection Log</h3>
          {selectedIp && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-500/20 text-accent-300 text-xs font-mono border border-accent-500/30">
              <Filter size={10} />
              {selectedIp}
              <button
                onClick={onClearIpFilter}
                className="hover:text-white p-0.5"
                title="Clear IP filter"
              >
                <X size={11} />
              </button>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
              isPaused
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                : 'bg-surface-800 text-surface-300 border-surface-700 hover:text-surface-100 hover:bg-surface-700'
            }`}
            title={isPaused ? 'Resume live updates' : 'Pause live updates'}
          >
            {isPaused ? <Play size={12} /> : <Pause size={12} />}
            {isPaused ? 'Paused' : 'Live'}
          </button>

          <button
            onClick={fetchLogs}
            disabled={refreshing}
            className="p-1.5 rounded-md bg-surface-800 border border-surface-700 text-surface-300 hover:text-surface-100 hover:bg-surface-700 transition-colors disabled:opacity-50"
            title="Refresh now"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by IP, client, or destination…"
            className="w-full bg-surface-900 border border-surface-800 rounded-md pl-8 pr-3 py-1 text-xs text-surface-200 placeholder:text-surface-500 focus:outline-none focus:border-accent-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="bg-surface-900 border border-surface-800 rounded-md px-2 py-1 text-xs text-surface-300 focus:outline-none focus:border-accent-500"
        >
          <option value={25}>25 rows</option>
          <option value={50}>50 rows</option>
          <option value={100}>100 rows</option>
        </select>
      </div>

      <div className="mt-3 flex-1 overflow-x-auto overflow-y-auto max-h-[360px] border border-surface-800 rounded-lg">
        <table className="w-full text-xs text-left">
          <thead className="bg-surface-900/90 sticky top-0 border-b border-surface-800 text-surface-400">
            <tr>
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Source IP</th>
              <th className="px-3 py-2 font-medium">Destination</th>
              <th className="px-3 py-2 font-medium text-right">State</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-800/60 font-mono">
            {filteredConnections.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-surface-500 font-sans">
                  {selectedIp
                    ? `No connection events recorded for IP ${selectedIp}.`
                    : 'No connection events recorded yet.'}
                </td>
              </tr>
            ) : (
              filteredConnections.map((c, idx) => (
                <tr key={`${c.id || idx}-${c.ts}`} className="hover:bg-surface-800/40 transition-colors">
                  <td className="px-3 py-2 text-surface-400 whitespace-nowrap font-sans text-[11px]">
                    {formatDate(c.ts)}
                  </td>
                  <td className="px-3 py-2 font-sans font-medium text-surface-200 truncate max-w-[120px]">
                    {c.clientName || c.email || '—'}
                  </td>
                  <td className="px-3 py-2 text-surface-300 whitespace-nowrap">
                    {c.source_ip}
                  </td>
                  <td className="px-3 py-2 text-surface-300 truncate max-w-[180px]" title={c.destination}>
                    {c.destination}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-sans font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {c.state}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
