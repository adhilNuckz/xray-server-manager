import { useEffect, useState, useRef } from 'react';
import { Terminal, Play, Pause, RefreshCw, Copy, Check, Search, X, ArrowDown } from 'lucide-react';
import api from '../services/api';

export default function GlobalXrayLog() {
  const [logType, setLogType] = useState('service'); // 'service' | 'access' | 'error'
  const [lines, setLines] = useState(100);
  const [filterText, setFilterText] = useState('');
  const [logs, setLogs] = useState([]);
  const [isPaused, setIsPaused] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);

  const terminalRef = useRef(null);
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  const fetchLogs = () => {
    if (isPausedRef.current) return;
    setRefreshing(true);
    const params = new URLSearchParams({
      type: logType,
      lines: String(lines),
    });
    if (filterText.trim()) {
      params.append('filter', filterText.trim());
    }

    api
      .get(`/xray/logs?${params.toString()}`)
      .then((res) => {
        setLogs(res.data.logs || []);
        setRefreshing(false);
      })
      .catch(() => setRefreshing(false));
  };

  useEffect(() => {
    fetchLogs();
    const id = setInterval(() => {
      fetchLogs();
    }, 4000);
    return () => clearInterval(id);
  }, [logType, lines, filterText]);

  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleCopy = () => {
    navigator.clipboard.writeText(logs.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getLineClass = (line) => {
    const l = line.toLowerCase();
    if (l.includes('error') || l.includes('failed') || l.includes('fatal') || l.includes('reject')) {
      return 'text-red-400 bg-red-950/20';
    }
    if (l.includes('warn') || l.includes('warning')) {
      return 'text-amber-400 bg-amber-950/20';
    }
    if (l.includes('accepted') || l.includes('started') || l.includes('success')) {
      return 'text-emerald-400';
    }
    if (l.includes('api -> api')) {
      return 'text-surface-500';
    }
    return 'text-surface-300';
  };

  return (
    <div className="card p-4 flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-surface-800">
        <div className="flex items-center gap-2">
          <Terminal size={17} className="text-accent-400" />
          <h3 className="text-sm font-semibold text-surface-100">Global Xray Log</h3>
          <span className="text-xs text-surface-500 hidden sm:inline">
            ({logs.length} lines)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Log Type Tabs */}
          <div className="inline-flex rounded-lg bg-surface-900 p-0.5 border border-surface-800 text-xs">
            <button
              onClick={() => setLogType('service')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                logType === 'service'
                  ? 'bg-accent-500 text-white shadow-sm'
                  : 'text-surface-400 hover:text-surface-200'
              }`}
            >
              Service (systemd)
            </button>
            <button
              onClick={() => setLogType('access')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                logType === 'access'
                  ? 'bg-accent-500 text-white shadow-sm'
                  : 'text-surface-400 hover:text-surface-200'
              }`}
            >
              Access Log
            </button>
            <button
              onClick={() => setLogType('error')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                logType === 'error'
                  ? 'bg-accent-500 text-white shadow-sm'
                  : 'text-surface-400 hover:text-surface-200'
              }`}
            >
              Error Log
            </button>
          </div>

          {/* Controls */}
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
              isPaused
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                : 'bg-surface-800 text-surface-300 border-surface-700 hover:text-surface-100 hover:bg-surface-700'
            }`}
            title={isPaused ? 'Resume log stream' : 'Pause log stream'}
          >
            {isPaused ? <Play size={12} /> : <Pause size={12} />}
            {isPaused ? 'Paused' : 'Streaming'}
          </button>

          <button
            onClick={fetchLogs}
            disabled={refreshing}
            className="p-1.5 rounded-md bg-surface-800 border border-surface-700 text-surface-300 hover:text-surface-100 hover:bg-surface-700 transition-colors disabled:opacity-50"
            title="Refresh now"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-surface-800 border border-surface-700 text-surface-300 hover:text-surface-100 hover:bg-surface-700 text-xs transition-colors"
            title="Copy logs"
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Filter and settings bar */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search / filter logs…"
            className="w-full bg-surface-900 border border-surface-800 rounded-md pl-8 pr-3 py-1 text-xs text-surface-200 placeholder:text-surface-500 focus:outline-none focus:border-accent-500"
          />
          {filterText && (
            <button
              onClick={() => setFilterText('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5 text-surface-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded bg-surface-800 border-surface-700 text-accent-500 focus:ring-0"
            />
            <span className="flex items-center gap-1">
              <ArrowDown size={11} />
              Auto-scroll
            </span>
          </label>

          <select
            value={lines}
            onChange={(e) => setLines(Number(e.target.value))}
            className="bg-surface-900 border border-surface-800 rounded-md px-2 py-1 text-xs text-surface-300 focus:outline-none focus:border-accent-500"
          >
            <option value={50}>50 lines</option>
            <option value={100}>100 lines</option>
            <option value={200}>200 lines</option>
          </select>
        </div>
      </div>

      {/* Terminal Display */}
      <div
        ref={terminalRef}
        className="mt-3 bg-surface-950 border border-surface-800/80 rounded-lg p-3 font-mono text-xs overflow-y-auto max-h-[340px] h-[340px] select-text shadow-inner"
      >
        {logs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-surface-600 font-sans">
            No log entries found.
          </div>
        ) : (
          logs.map((line, index) => (
            <div
              key={index}
              className={`leading-relaxed py-0.5 px-1 rounded flex items-start gap-2.5 hover:bg-surface-900/60 transition-colors ${getLineClass(
                line
              )}`}
            >
              <span className="text-surface-600 select-none text-[10px] w-7 shrink-0 text-right pt-0.5">
                {index + 1}
              </span>
              <span className="break-all whitespace-pre-wrap flex-1">{line}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
