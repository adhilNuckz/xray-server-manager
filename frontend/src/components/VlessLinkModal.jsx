import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, ExternalLink } from 'lucide-react';
import Modal from './Modal';
import api from '../services/api';

function inboundLabel(l) {
  const security = l.security === 'reality' ? 'Reality' : l.security === 'tls' ? 'TLS' : l.security;
  const pack = l.packMatch ? ' ★' : '';
  const sniBit = l.security === 'reality' && l.sni ? ` · ${l.sni}` : '';
  return `${security} · ${l.network.toUpperCase()} · :${l.port}${sniBit}${pack}`;
}

export default function VlessLinkModal({ open, onClose, client }) {
  const [links, setLinks] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedUsage, setCopiedUsage] = useState(false);
  const usageUrl = client?.id ? `${window.location.origin}/usage/${client.id}` : '';

  useEffect(() => {
    if (open && client) {
      setLoading(true);
      setError('');
      setLinks([]);
      setActiveIdx(0);
      api
        .get(`/clients/${client.id}/vless`)
        .then((res) => setLinks(res.data.links || []))
        .catch((err) => setError(err.response?.data?.error || 'Failed to generate VLESS link'))
        .finally(() => setLoading(false));
    }
  }, [open, client]);

  const active = links[activeIdx];

  const copyUsage = async () => {
    if (!usageUrl) return;
    await navigator.clipboard.writeText(usageUrl);
    setCopiedUsage(true);
    setTimeout(() => setCopiedUsage(false), 2000);
  };

  const copy = async () => {
    if (!active) return;
    await navigator.clipboard.writeText(active.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal open={open} onClose={onClose} title={`VLESS link — ${client?.name || ''}`} width="max-w-md">
      {loading && <p className="text-sm text-surface-500">Generating link…</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!loading && active && (
        <div className="space-y-4">
          {links.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {links.map((l, idx) => (
                <button
                  key={`${l.port}-${l.network}-${l.security}`}
                  onClick={() => setActiveIdx(idx)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    idx === activeIdx
                      ? 'bg-accent-600/20 border-accent-600/50 text-accent-300'
                      : 'bg-surface-800 border-surface-700 text-surface-400 hover:text-surface-100'
                  }`}
                >
                  {inboundLabel(l)}
                </button>
              ))}
            </div>
          )}

          <div className="flex justify-center bg-white rounded-lg p-4">
            <QRCodeSVG value={active.link} size={200} />
          </div>
          <div>
            <label className="label">Share link {links.length > 1 ? `(${inboundLabel(active)})` : ''}</label>
            <div className="flex gap-2">
              <input
                readOnly
                className="input font-mono text-xs"
                value={active.link}
                onFocus={(e) => e.target.select()}
              />
              <button className="btn-secondary shrink-0" onClick={copy}>
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-surface-700/60">
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">Client Usage & Speed Portal</label>
              <a
                href={usageUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-accent-400 hover:text-accent-300 flex items-center gap-1"
              >
                <ExternalLink size={12} />
                Open
              </a>
            </div>
            <div className="flex gap-2">
              <input
                readOnly
                className="input font-mono text-xs text-accent-300"
                value={usageUrl}
                onFocus={(e) => e.target.select()}
              />
              <button className="btn-secondary shrink-0" onClick={copyUsage}>
                {copiedUsage ? <Check size={15} /> : <Copy size={15} />}
                {copiedUsage ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
          <p className="text-xs text-surface-500">
            {active.security === 'reality' && active.sni ? (
              <>
                Reality link uses SNI <span className="font-mono text-surface-300">{active.sni}</span> for this
                client&apos;s data pack.
              </>
            ) : links.length > 1 ? (
              'This server exposes multiple VLESS inbounds for this client - pick whichever connection works best on your network.'
            ) : (
              'Scan the QR code with a VLESS-compatible client, or paste the link directly into the app.'
            )}
          </p>
        </div>
      )}
    </Modal>
  );
}
