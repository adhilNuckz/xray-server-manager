import { useEffect, useState } from 'react';
import { Radio, Copy, Check, Filter, Globe, ArrowUpRight } from 'lucide-react';
import api from '../services/api';
import { timeAgo } from '../utils/format';

export default function ActiveUsersCard({ onSelectIp, selectedIp }) {
  const [data, setData] = useState({
    activeConnections: [],
    totalActiveUsers: 0,
    totalActiveIps: 0,
    windowSeconds: 90,
    accessLogAvailable: true,
  });
  const [loading, setLoading] = useState(true);
  const [copiedIp, setCopiedIp] = useState(null);

  const fetchActive = () => {
    api
      .get('/connections/active?window=90')
      .then((res) => {
        setData(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchActive();
    const id = setInterval(fetchActive, 4000);
    return () => clearInterval(id);
  }, []);

  const handleCopy = (ip, e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(ip);
    setCopiedIp(ip);
    setTimeout(() => setCopiedIp(null), 2000);
  };

  return (
    <div className="card p-4 flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 border-b border-surface-800">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <h3 className="text-sm font-semibold text-surface-100">Currently Connected Users</h3>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium border border-emerald-500/20">
            {data.totalActiveUsers} online
          </span>
          <span className="px-2 py-0.5 rounded-full bg-surface-800 text-surface-300 font-medium">
            {data.totalActiveIps} IP{data.totalActiveIps === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className="mt-3 flex-1 overflow-y-auto max-h-[360px] pr-1 space-y-2.5">
        {loading && data.activeConnections.length === 0 ? (
          <div className="py-8 text-center text-xs text-surface-500">Scanning active connections…</div>
        ) : data.activeConnections.length === 0 ? (
          <div className="py-8 text-center text-surface-500 flex flex-col items-center justify-center">
            <Radio className="text-surface-600 mb-2" size={28} />
            <p className="text-xs font-medium text-surface-400">No active clients connected</p>
            <p className="text-[11px] text-surface-500 mt-1 max-w-xs">
              When a client starts routing traffic through VLESS, their IP and destination will appear here in real time.
            </p>
          </div>
        ) : (
          data.activeConnections.map((conn, idx) => {
            const isSelected = selectedIp === conn.sourceIp;
            return (
              <div
                key={`${conn.email}-${conn.sourceIp}-${idx}`}
                className={`p-3 rounded-lg border transition-all ${
                  isSelected
                    ? 'border-accent-500/60 bg-accent-500/10'
                    : 'border-surface-800/80 bg-surface-900/60 hover:border-surface-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
                      <p className="text-sm font-semibold text-surface-100 truncate">
                        {conn.clientName || conn.email}
                      </p>
                    </div>
                    {conn.clientName && (
                      <p className="text-xs text-surface-400 font-mono truncate ml-3.5">{conn.email}</p>
                    )}
                  </div>
                  <span className="text-[11px] text-surface-400 shrink-0 bg-surface-800/80 px-2 py-0.5 rounded">
                    {timeAgo(conn.lastSeen)}
                  </span>
                </div>

                <div className="mt-2.5 pt-2 border-t border-surface-800/60 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 font-mono text-surface-200">
                    <Globe size={13} className="text-surface-400 shrink-0" />
                    <span>{conn.sourceIp}</span>
                    <button
                      onClick={(e) => handleCopy(conn.sourceIp, e)}
                      title="Copy IP address"
                      className="text-surface-500 hover:text-surface-200 p-0.5 transition-colors"
                    >
                      {copiedIp === conn.sourceIp ? (
                        <Check size={12} className="text-emerald-400" />
                      ) : (
                        <Copy size={12} />
                      )}
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    {onSelectIp && (
                      <button
                        onClick={() => onSelectIp(isSelected ? null : conn.sourceIp)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                          isSelected
                            ? 'bg-accent-500 text-white'
                            : 'bg-surface-800 text-surface-300 hover:text-surface-100 hover:bg-surface-700'
                        }`}
                      >
                        <Filter size={10} />
                        {isSelected ? 'Filtering' : 'Filter Log'}
                      </button>
                    )}
                  </div>
                </div>

                {conn.destination && (
                  <div className="mt-1.5 text-[11px] text-surface-400 truncate flex items-center gap-1">
                    <ArrowUpRight size={11} className="text-surface-500 shrink-0" />
                    <span className="truncate">{conn.destination}</span>
                    <span className="text-surface-500 shrink-0">({conn.requestCount} hits)</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
