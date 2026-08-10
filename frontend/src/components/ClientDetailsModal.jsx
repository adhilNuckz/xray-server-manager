import Modal from './Modal';
import StatusBadge from './StatusBadge';
import { formatBytes, formatDate, formatDateOnly, timeAgo } from '../utils/format';

export default function ClientDetailsModal({ open, onClose, client }) {
  if (!client) return null;
  return (
    <Modal open={open} onClose={onClose} title={`Client details — ${client.name}`} width="max-w-lg">
      <div className="space-y-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-surface-400">Status</span>
          <StatusBadge status={client.status} />
        </div>
        <Field label="Name" value={client.name} />
        <Field label="Email / identifier" value={client.email} />
        <Field label="UUID" value={client.id} mono />
        <Field label="Data pack / SNI" value={client.sni || 'Default (first server name)'} mono />
        <Field label="Flow" value={client.flow || 'none'} />
        <Field label="Created" value={formatDate(client.created_at)} />
        <Field label="Expiration" value={client.expires_at ? formatDateOnly(client.expires_at) : 'Never'} />
        <Field label="Last seen" value={client.lastSeen ? `${timeAgo(client.lastSeen)}` : 'No data yet'} />
        <Field label="Active connections" value={client.activeConnections ?? 0} />
        <Field label="Upload" value={formatBytes(client.traffic?.uplink)} />
        <Field label="Download" value={formatBytes(client.traffic?.downlink)} />
        <Field label="Total traffic" value={formatBytes(client.traffic?.total)} />
        {client.notes && (
          <div>
            <p className="text-surface-400 mb-1">Notes</p>
            <p className="text-surface-200 bg-surface-800 rounded-lg p-2 whitespace-pre-wrap">{client.notes}</p>
          </div>
        )}
        {client.imported ? (
          <p className="text-xs text-amber-400">This client was auto-imported from the existing Xray configuration.</p>
        ) : null}
      </div>
    </Modal>
  );
}

function Field({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-surface-400 shrink-0">{label}</span>
      <span className={`text-surface-100 text-right break-all ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}
