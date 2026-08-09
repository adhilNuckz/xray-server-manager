const STYLES = {
  ACTIVE: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30',
  EXPIRING_SOON: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30',
  EXPIRED: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30',
  DISABLED: 'bg-surface-600/20 text-surface-400 ring-1 ring-surface-600/30',
};

const LABELS = {
  ACTIVE: 'Active',
  EXPIRING_SOON: 'Expiring soon',
  EXPIRED: 'Expired',
  DISABLED: 'Disabled',
};

export default function StatusBadge({ status }) {
  return <span className={`badge ${STYLES[status] || STYLES.DISABLED}`}>{LABELS[status] || status}</span>;
}
