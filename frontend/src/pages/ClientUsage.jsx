import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import {
  Activity,
  ArrowDownCircle,
  ArrowUpCircle,
  Check,
  Clock,
  Copy,
  Gauge,
  Globe,
  HardDrive,
  RefreshCw,
  Server,
  ShieldCheck,
  Wifi,
  Zap,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatBytes, formatBitsPerSecond, formatDate, timeAgo } from '../utils/format';

export default function ClientUsage() {
  const { id } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Ping tracking
  const [ping, setPing] = useState(null);
  const [pingJitter, setPingJitter] = useState(null);
  const [pingHistory, setPingHistory] = useState([]);

  // Live speed history for the chart
  const [speedChart, setSpeedChart] = useState([]);

  // On-demand speed test state
  const [speedTestActive, setSpeedTestActive] = useState(false);
  const [speedTestPhase, setSpeedTestPhase] = useState('idle'); // idle | ping | download | upload | finished
  const [speedTestResults, setSpeedTestResults] = useState(null);
  const [speedTestLiveSpeed, setSpeedTestLiveSpeed] = useState(0); // in Mbps
  const [speedTestProgress, setSpeedTestProgress] = useState(0); // 0 - 100

  // 1. Initial Load & Polling for usage data
  const fetchUsage = useCallback(async () => {
    try {
      const res = await axios.get(`/api/public/usage/${id}`);
      setData(res.data);
      setError(null);

      if (res.data?.traffic?.speedHistory?.length) {
        const formatted = res.data.traffic.speedHistory.map((p, idx) => ({
          time: `${idx}s`,
          down: p.downSpeed || 0,
          up: p.upSpeed || 0,
        }));
        setSpeedChart(formatted);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to load client usage. Please check your link.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  // 2. Real-time SSE Stream for Live Usage & Speed
  useEffect(() => {
    if (!id || error) return;

    let eventSource = null;
    try {
      eventSource = new EventSource(`/api/public/usage/${id}/stream`);

      eventSource.onmessage = (event) => {
        try {
          const update = JSON.parse(event.data);
          setData((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              traffic: {
                ...prev.traffic,
                uplink: update.uplink ?? prev.traffic.uplink,
                downlink: update.downlink ?? prev.traffic.downlink,
                total: update.total ?? prev.traffic.total,
                upSpeed: update.upSpeed ?? prev.traffic.upSpeed,
                downSpeed: update.downSpeed ?? prev.traffic.downSpeed,
              },
            };
          });

          // Append to chart history
          setSpeedChart((prev) => {
            const next = [
              ...prev,
              {
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                down: update.downSpeed || 0,
                up: update.upSpeed || 0,
              },
            ];
            return next.slice(-40); // keep last 40 seconds
          });
        } catch (_) {
          /* ignore parse error */
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
      };
    } catch (_) {
      /* fallback to interval */
    }

    return () => {
      if (eventSource) eventSource.close();
    };
  }, [id, error]);

  // 3. Continuous Ping Measurement
  const pingRef = useRef();
  const measurePing = useCallback(async () => {
    try {
      const t0 = performance.now();
      await axios.get(`/api/public/ping?_t=${Date.now()}`, { timeout: 4000 });
      const rtt = Math.round(performance.now() - t0);

      setPing(rtt);
      setPingHistory((prev) => {
        const next = [...prev, rtt].slice(-10);
        if (next.length > 1) {
          let diffSum = 0;
          for (let i = 1; i < next.length; i++) {
            diffSum += Math.abs(next[i] - next[i - 1]);
          }
          setPingJitter(Math.round(diffSum / (next.length - 1)));
        }
        return next;
      });
    } catch (_) {
      setPing(null);
    }
  }, []);

  useEffect(() => {
    measurePing();
    const interval = setInterval(measurePing, 2500);
    return () => clearInterval(interval);
  }, [measurePing]);

  // 4. Interactive Speed Test Runner
  const runSpeedTest = async () => {
    if (speedTestActive) return;
    setSpeedTestActive(true);
    setSpeedTestResults(null);
    setSpeedTestLiveSpeed(0);
    setSpeedTestProgress(0);

    try {
      // Phase 1: Ping & Jitter
      setSpeedTestPhase('ping');
      const pingSamples = [];
      for (let i = 0; i < 4; i++) {
        const t0 = performance.now();
        await axios.get(`/api/public/ping?_t=${Date.now()}`);
        pingSamples.push(Math.round(performance.now() - t0));
        setSpeedTestProgress((i + 1) * 5); // 0 - 20%
        await new Promise((r) => setTimeout(r, 100));
      }
      const testPing = Math.round(pingSamples.reduce((a, b) => a + b, 0) / pingSamples.length);
      const testJitter = Math.round(
        Math.abs(pingSamples[1] - pingSamples[0]) + Math.abs(pingSamples[2] - pingSamples[1])
      ) / 2;

      // Phase 2: Download Test (10 MB stream)
      setSpeedTestPhase('download');
      const testBytes = 10 * 1024 * 1024;
      const downloadStart = performance.now();
      let downloadedBytes = 0;

      const response = await fetch(`/api/public/speedtest/download?bytes=${testBytes}&_t=${Date.now()}`);
      const reader = response.body.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        downloadedBytes += value.length;
        const elapsedSec = (performance.now() - downloadStart) / 1000;
        const currentSpeedMbps = (downloadedBytes * 8) / (elapsedSec * 1000 * 1000);
        setSpeedTestLiveSpeed(parseFloat(currentSpeedMbps.toFixed(2)));
        setSpeedTestProgress(20 + Math.min(40, Math.round((downloadedBytes / testBytes) * 40)));
      }
      const downloadSec = (performance.now() - downloadStart) / 1000;
      const finalDownloadSpeed = (downloadedBytes * 8) / (downloadSec * 1000 * 1000);

      // Phase 3: Upload Test (5 MB payload)
      setSpeedTestPhase('upload');
      setSpeedTestLiveSpeed(0);
      const uploadBytes = 5 * 1024 * 1024;
      const dummyPayload = new Uint8Array(uploadBytes);
      crypto.getRandomValues(dummyPayload.subarray(0, 1024)); // touch memory

      const uploadStart = performance.now();
      const uploadRes = await axios.post(`/api/public/speedtest/upload?_t=${Date.now()}`, dummyPayload, {
        headers: { 'Content-Type': 'application/octet-stream' },
        onUploadProgress: (progressEvent) => {
          const loaded = progressEvent.loaded || 0;
          const elapsed = (performance.now() - uploadStart) / 1000;
          if (elapsed > 0) {
            const currentSpeed = (loaded * 8) / (elapsed * 1000 * 1000);
            setSpeedTestLiveSpeed(parseFloat(currentSpeed.toFixed(2)));
          }
          setSpeedTestProgress(60 + Math.min(40, Math.round((loaded / uploadBytes) * 40)));
        },
      });

      const finalUploadSpeed = uploadRes.data?.speedMbps || 0;

      // Finish
      setSpeedTestPhase('finished');
      setSpeedTestProgress(100);
      setSpeedTestResults({
        ping: testPing,
        jitter: Math.round(testJitter),
        download: parseFloat(finalDownloadSpeed.toFixed(2)),
        upload: parseFloat(finalUploadSpeed.toFixed(2)),
      });
    } catch (err) {
      setSpeedTestPhase('idle');
      alert('Speed test encountered a network interruption: ' + (err.message || 'unknown'));
    } finally {
      setSpeedTestActive(false);
    }
  };

  const copyId = async () => {
    if (!data?.client?.id) return;
    await navigator.clipboard.writeText(data.client.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const copyUsageLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-16 h-16 relative flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-4 border-cyan-500/20 border-t-cyan-400 animate-spin" />
          <Wifi className="w-6 h-6 text-cyan-400 animate-pulse" />
        </div>
        <p className="mt-4 text-sm font-medium text-slate-400">Loading client telemetry…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center backdrop-blur-xl shadow-2xl">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
            <ShieldCheck className="w-8 h-8 text-rose-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-100 mb-2">Access Portal</h1>
          <p className="text-sm text-slate-400 mb-6">{error || 'Client record not found'}</p>
          <button
            onClick={fetchUsage}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-all"
          >
            <RefreshCw size={16} />
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const { client, server, traffic } = data;
  const isExpired = client.status === 'expired';
  const isDisabled = client.status === 'disabled';
  const isActive = client.status === 'active';

  // Ping quality helper
  const pingColor =
    ping == null ? 'text-slate-500' : ping < 70 ? 'text-emerald-400' : ping < 160 ? 'text-amber-400' : 'text-rose-400';
  const pingBg =
    ping == null
      ? 'bg-slate-800/40 border-slate-700'
      : ping < 70
      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
      : ping < 160
      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
      : 'bg-rose-500/10 border-rose-500/30 text-rose-300';
  const pingQualityText =
    ping == null ? 'Checking…' : ping < 70 ? 'Optimal' : ping < 160 ? 'Good' : 'High Latency';

  // Calculate download / upload proportions
  const totalBytes = traffic.total || 0;
  const downRatio = totalBytes > 0 ? ((traffic.downlink || 0) / totalBytes) * 100 : 50;
  const upRatio = totalBytes > 0 ? ((traffic.uplink || 0) / totalBytes) * 100 : 50;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-cyan-500 selection:text-black">
      {/* Background radial glow effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-cyan-600/15 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        {/* Top Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">SoliT Network</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
                  Client Portal
                </span>
              </div>
              <p className="text-xs text-slate-400">Live Telemetry & Bandwidth Usage Monitor</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={copyUsageLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-colors shadow-sm"
              title="Copy your personal usage link"
            >
              {copiedLink ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              <span>{copiedLink ? 'Link Copied' : 'Share Link'}</span>
            </button>
            <button
              onClick={fetchUsage}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-colors shadow-sm"
              title="Refresh Telemetry"
            >
              <RefreshCw size={14} />
              <span>Refresh</span>
            </button>
          </div>
        </header>

        {/* Server & Status Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Server Location & Country Flag */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-xl flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-2xl shadow-inner">
              {server.flag || '🌐'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Globe size={13} className="text-cyan-400" />
                <span>Server Location</span>
              </div>
              <p className="text-sm font-semibold text-slate-100 truncate">
                {server.country} {server.city ? `(${server.city})` : ''}
              </p>
              <p className="text-[11px] font-mono text-slate-500 truncate">{server.address}</p>
            </div>
          </div>

          {/* Real-Time Live Ping */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-xl flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center shadow-inner">
              <Gauge className={`w-6 h-6 ${pingColor}`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  Live Latency
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${pingBg}`}>
                  {pingQualityText}
                </span>
              </div>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className={`text-xl font-bold font-mono tracking-tight ${pingColor}`}>
                  {ping !== null ? ping : '—'}
                </span>
                <span className="text-xs text-slate-500 font-medium">ms</span>
                {pingJitter !== null && (
                  <span className="text-[10px] text-slate-500 ml-auto font-mono">±{pingJitter}ms jitter</span>
                )}
              </div>
            </div>
          </div>

          {/* Account Status Card */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-xl flex items-center gap-3.5">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-inner ${
                isActive
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                  : isExpired
                  ? 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                  : 'bg-slate-800 border border-slate-700 text-slate-400'
              }`}
            >
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <Server size={13} className="text-indigo-400" />
                Service Status
              </span>
              <p
                className={`text-sm font-semibold capitalize ${
                  isActive ? 'text-emerald-400' : isExpired ? 'text-rose-400' : 'text-slate-400'
                }`}
              >
                {isActive ? '● Connected & Active' : isExpired ? 'Expired Subscription' : 'Account Disabled'}
              </p>
              <p className="text-[11px] text-slate-500 truncate">
                {client.expires_at ? `Expires ${formatDate(client.expires_at)}` : 'Unlimited Plan'}
              </p>
            </div>
          </div>
        </div>

        {/* Client Profile Header Bar */}
        <div className="bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-slate-900/90 border border-slate-800 rounded-2xl p-5 backdrop-blur-xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-white">{client.name}</span>
              <span className="text-xs font-mono text-slate-400">({client.email})</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="flex items-center gap-1 font-mono text-slate-400 bg-slate-950/60 px-2 py-0.5 rounded border border-slate-800">
                UUID: {client.id.slice(0, 8)}…{client.id.slice(-6)}
                <button onClick={copyId} className="hover:text-cyan-400 transition-colors ml-1" title="Copy Client ID">
                  {copiedId ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                </button>
              </span>
              {client.sni && (
                <span className="bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded text-[11px]">
                  Pack SNI: {client.sni}
                </span>
              )}
              <span className="flex items-center gap-1 text-slate-500">
                <Clock size={12} /> Last active: {timeAgo(traffic.lastSeen)}
              </span>
            </div>
          </div>

          {/* Quick link button */}
          <button
            onClick={() => {
              const el = document.getElementById('speedtest-section');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/25 transition-all self-start md:self-auto"
          >
            <Gauge size={15} />
            Test Live Internet Speed
          </button>
        </div>

        {/* Traffic Statistics Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Total Data Card */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl group-hover:bg-cyan-500/10 transition-all pointer-events-none" />
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Total Transferred</span>
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <HardDrive size={16} />
              </div>
            </div>
            <div className="text-3xl font-bold font-mono text-white tracking-tight">
              {formatBytes(traffic.total)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Combined uplink and downlink</p>

            {/* Ratio Progress Bar */}
            <div className="mt-4 pt-3 border-t border-slate-800/60">
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
                <div style={{ width: `${downRatio}%` }} className="bg-cyan-400 h-full transition-all duration-500" />
                <div style={{ width: `${upRatio}%` }} className="bg-emerald-400 h-full transition-all duration-500" />
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 mt-1.5 font-mono">
                <span>Down: {downRatio.toFixed(0)}%</span>
                <span>Up: {upRatio.toFixed(0)}%</span>
              </div>
            </div>
          </div>

          {/* Downloaded Card */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl group-hover:bg-cyan-500/10 transition-all pointer-events-none" />
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Total Download</span>
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <ArrowDownCircle size={16} />
              </div>
            </div>
            <div className="text-3xl font-bold font-mono text-cyan-300 tracking-tight">
              {formatBytes(traffic.downlink)}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-slate-400">Live Traffic Rate:</span>
              <span className="text-xs font-mono font-bold text-cyan-400">
                {formatBitsPerSecond(traffic.downSpeed)}
              </span>
            </div>
          </div>

          {/* Uploaded Card */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all pointer-events-none" />
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Total Upload</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <ArrowUpCircle size={16} />
              </div>
            </div>
            <div className="text-3xl font-bold font-mono text-emerald-300 tracking-tight">
              {formatBytes(traffic.uplink)}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-slate-400">Live Traffic Rate:</span>
              <span className="text-xs font-mono font-bold text-emerald-400">
                {formatBitsPerSecond(traffic.upSpeed)}
              </span>
            </div>
          </div>
        </div>

        {/* Live Bandwidth Activity Sparkline */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                Live Tunnel Activity (Last 40s)
              </h2>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                <span className="text-slate-400">Download: {formatBitsPerSecond(traffic.downSpeed)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <span className="text-slate-400">Upload: {formatBitsPerSecond(traffic.upSpeed)}</span>
              </div>
            </div>
          </div>

          <div className="h-44 w-full">
            {speedChart.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={speedChart} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="downGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="upGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" stroke="#475569" fontSize={10} tickLine={false} />
                  <YAxis
                    stroke="#475569"
                    fontSize={10}
                    tickFormatter={(v) => formatBitsPerSecond(v)}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem' }}
                    labelStyle={{ color: '#94a3b8' }}
                    formatter={(val) => [formatBitsPerSecond(val)]}
                  />
                  <Area
                    type="monotone"
                    dataKey="down"
                    name="Download"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#downGrad)"
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="up"
                    name="Upload"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#upGrad)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500 font-mono">
                Listening for real-time traffic events…
              </div>
            )}
          </div>
        </div>

        {/* Live Speed Test Suite Section */}
        <div id="speedtest-section" className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <Gauge className="w-5 h-5 text-cyan-400" />
                <h2 className="text-base font-bold text-white">Connection Speed Benchmark</h2>
              </div>
              <p className="text-xs text-slate-400">
                Test your current network latency, download and upload throughput directly with the proxy server.
              </p>
            </div>

            {!speedTestActive ? (
              <button
                onClick={runSpeedTest}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white shadow-lg shadow-cyan-500/20 active:scale-95 transition-all"
              >
                <Zap size={16} />
                {speedTestResults ? 'Run Speed Test Again' : 'Start Speed Test'}
              </button>
            ) : (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-medium animate-pulse">
                <RefreshCw size={14} className="animate-spin" />
                <span>Running benchmark… ({speedTestProgress}%)</span>
              </div>
            )}
          </div>

          {/* Speed test in progress display */}
          {speedTestActive && (
            <div className="py-8 flex flex-col items-center justify-center space-y-6">
              {/* Dial Gauge Mock */}
              <div className="relative w-44 h-44 flex flex-col items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="88"
                    cy="88"
                    r="76"
                    stroke="#1e293b"
                    strokeWidth="10"
                    fill="transparent"
                  />
                  <circle
                    cx="88"
                    cy="88"
                    r="76"
                    stroke={speedTestPhase === 'download' ? '#06b6d4' : speedTestPhase === 'upload' ? '#10b981' : '#6366f1'}
                    strokeWidth="10"
                    strokeDasharray={477}
                    strokeDashoffset={477 - (477 * speedTestProgress) / 100}
                    strokeLinecap="round"
                    fill="transparent"
                    className="transition-all duration-300 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-3xl font-extrabold font-mono text-white tracking-tight">
                    {speedTestPhase === 'ping' ? '...' : speedTestLiveSpeed}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {speedTestPhase === 'ping' ? 'Pinging' : 'Mbps'}
                  </span>
                </div>
              </div>

              {/* Phase Status */}
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold capitalize text-slate-200">
                  {speedTestPhase === 'ping' && 'Phase 1: Measuring Latency & Jitter…'}
                  {speedTestPhase === 'download' && 'Phase 2: Streaming Download Test (10 MB)…'}
                  {speedTestPhase === 'upload' && 'Phase 3: Measuring Upload Throughput…'}
                </p>
                <p className="text-xs text-slate-500">Keep this browser tab open until the test finishes.</p>
              </div>

              {/* Progress bar */}
              <div className="w-full max-w-md h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-400 transition-all duration-300"
                  style={{ width: `${speedTestProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Speed test results */}
          {!speedTestActive && speedTestResults && (
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 text-center">
                <div className="text-xs text-slate-400 mb-1">Ping</div>
                <div className="text-2xl font-bold font-mono text-white">
                  {speedTestResults.ping} <span className="text-xs text-slate-500">ms</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-1">±{speedTestResults.jitter}ms jitter</div>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 text-center">
                <div className="text-xs text-cyan-400 mb-1 flex items-center justify-center gap-1">
                  <ArrowDownCircle size={13} />
                  <span>Download</span>
                </div>
                <div className="text-2xl font-bold font-mono text-cyan-300">
                  {speedTestResults.download} <span className="text-xs text-slate-500">Mbps</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-1">Peak speed</div>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 text-center">
                <div className="text-xs text-emerald-400 mb-1 flex items-center justify-center gap-1">
                  <ArrowUpCircle size={13} />
                  <span>Upload</span>
                </div>
                <div className="text-2xl font-bold font-mono text-emerald-300">
                  {speedTestResults.upload} <span className="text-xs text-slate-500">Mbps</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-1">Peak speed</div>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 text-center">
                <div className="text-xs text-indigo-400 mb-1">Server Host</div>
                <div className="text-xs font-semibold text-slate-200 truncate mt-1">
                  {server.country} {server.flag}
                </div>
                <div className="text-[10px] font-mono text-slate-500 truncate mt-1">
                  {server.address}
                </div>
              </div>
            </div>
          )}

          {!speedTestActive && !speedTestResults && (
            <div className="py-6 text-center text-xs text-slate-500 font-mono">
              Tap &quot;Start Speed Test&quot; above to perform an end-to-end benchmark against this proxy node.
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="pt-6 pb-8 border-t border-slate-800/60 text-center text-xs text-slate-500 space-y-1">
          <p>© {new Date().getFullYear()} SoliT Ways • Powered by Xray-core Enterprise</p>
          <p className="font-mono text-[11px] text-slate-600">
            Node: {server.address} • Protected via TLSv1.3 & REALITY Architecture
          </p>
        </footer>
      </div>
    </div>
  );
}
