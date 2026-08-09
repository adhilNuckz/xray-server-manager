import { useEffect, useState } from 'react';
import {
  Users,
  UserCheck,
  UserX,
  Network,
  Download,
  Upload,
  Database,
  Cpu,
  MemoryStick,
  HardDrive,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import api from '../services/api';
import { usePageTitle } from '../context/PageTitleContext';
import StatCard from '../components/StatCard';
import BandwidthChart from '../components/BandwidthChart';
import ConnectionsChart from '../components/ConnectionsChart';
import useTrafficStream from '../hooks/useTrafficStream';
import { formatBytes, formatBitsPerSecond, formatUptime, timeAgo } from '../utils/format';

export default function Dashboard() {
  usePageTitle('Dashboard');
  const [overview, setOverview] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const { points } = useTrafficStream(60);

  useEffect(() => {
    const fetchOverview = () => api.get('/stats').then((res) => setOverview(res.data)).catch(() => {});
    fetchOverview();
    const id = setInterval(fetchOverview, 10000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const fetchLogs = () =>
      api
        .get('/audit?limit=8')
        .then((res) => setAuditLogs(res.data.logs))
        .catch(() => {});
    fetchLogs();
    const id = setInterval(fetchLogs, 15000);
    return () => clearInterval(id);
  }, []);

  const server = overview?.server;
  const clients = overview?.clients;
  const bandwidth = overview?.bandwidth;
  const latest = points[points.length - 1];

  return (
    <div className="space-y-6">
      {overview && !overview.statsApi?.enabled && (
        <div className="card border-amber-600/40 bg-amber-500/5 p-4 flex items-start gap-3">
          <AlertTriangle className="text-amber-400 mt-0.5 shrink-0" size={18} />
          <div className="text-sm text-amber-200">
            <p className="font-medium">Per-client traffic statistics are not yet enabled</p>
            <p className="text-amber-300/80 mt-0.5">
              Enable the Xray Stats API from the Traffic page to see accurate upload/download totals per client.
              System-wide bandwidth below is measured directly from the network interface and is always accurate.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Total Clients" value={clients?.total ?? '—'} accent="accent" />
        <StatCard icon={UserCheck} label="Active Clients" value={clients?.active ?? '—'} accent="emerald" />
        <StatCard icon={UserX} label="Expired Clients" value={clients?.expired ?? '—'} accent="red" />
        <StatCard
          icon={Network}
          label="Active Connections"
          value={latest?.activeConnections ?? bandwidth?.activeConnections ?? '—'}
          accent="sky"
        />
        <StatCard
          icon={Download}
          label="Download Speed"
          value={formatBitsPerSecond(latest?.rxSec ?? bandwidth?.downloadBps ?? 0)}
          accent="accent"
        />
        <StatCard
          icon={Upload}
          label="Upload Speed"
          value={formatBitsPerSecond(latest?.txSec ?? bandwidth?.uploadBps ?? 0)}
          accent="accent"
        />
        <StatCard
          icon={Database}
          label="Total Traffic (session)"
          value={formatBytes(bandwidth?.totalBytes ?? 0)}
          accent="accent"
        />
        <StatCard
          icon={Clock}
          label="Server Uptime"
          value={server ? formatUptime(server.uptimeSeconds) : '—'}
          accent="accent"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-surface-200 mb-2">Download bandwidth</h3>
          <BandwidthChart data={points} series={[{ key: 'rxSec', name: 'Download', color: '#22d3ee' }]} />
        </div>
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-surface-200 mb-2">Upload bandwidth</h3>
          <BandwidthChart data={points} series={[{ key: 'txSec', name: 'Upload', color: '#a78bfa' }]} />
        </div>
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-surface-200 mb-2">Total bandwidth</h3>
          <BandwidthChart
            data={points}
            series={[
              { key: 'rxSec', name: 'Download', color: '#22d3ee' },
              { key: 'txSec', name: 'Upload', color: '#a78bfa' },
            ]}
          />
        </div>
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-surface-200 mb-2">Active connections</h3>
          <ConnectionsChart data={points} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-4 lg:col-span-1">
          <h3 className="text-sm font-semibold text-surface-200 mb-3">Server</h3>
          {server ? (
            <div className="space-y-3 text-sm">
              <Row icon={Cpu} label="CPU usage" value={`${server.cpuUsagePercent}%`} />
              <Row icon={MemoryStick} label="Memory" value={`${server.memory.usedPercent}% of ${formatBytes(server.memory.total)}`} />
              <Row icon={HardDrive} label="Disk" value={`${server.disk.usedPercent}% of ${formatBytes(server.disk.total)}`} />
              <Row label="Hostname" value={server.hostname} />
              <Row label="OS" value={server.platform} />
              <Row label="Public IP" value={server.publicIp || '—'} />
            </div>
          ) : (
            <p className="text-sm text-surface-500">Loading…</p>
          )}
        </div>

        <div className="card p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-surface-200 mb-3">Recent activity</h3>
          <div className="space-y-2">
            {auditLogs.length === 0 && <p className="text-sm text-surface-500">No activity yet.</p>}
            {auditLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between text-sm border-b border-surface-800 last:border-0 py-1.5">
                <div>
                  <span className="text-surface-200 font-medium">{log.actor}</span>
                  <span className="text-surface-500"> — {log.action.replace(/_/g, ' ')}</span>
                </div>
                <span className="text-xs text-surface-500">{timeAgo(log.ts)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-surface-400">
        {Icon && <Icon size={14} />}
        {label}
      </span>
      <span className="text-surface-100 font-medium">{value}</span>
    </div>
  );
}
