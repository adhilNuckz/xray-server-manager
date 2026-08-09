export default function StatCard({ icon: Icon, label, value, sub, accent = 'accent', trend }) {
  const colorMap = {
    accent: 'bg-accent-600/15 text-accent-400',
    emerald: 'bg-emerald-500/15 text-emerald-400',
    amber: 'bg-amber-500/15 text-amber-400',
    red: 'bg-red-500/15 text-red-400',
    sky: 'bg-sky-500/15 text-sky-400',
  };
  return (
    <div className="card p-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-surface-400">{label}</p>
        <p className="mt-1.5 text-2xl font-semibold text-surface-50 truncate">{value}</p>
        {sub && <p className="mt-1 text-xs text-surface-500">{sub}</p>}
        {trend && <p className="mt-1 text-xs text-emerald-400">{trend}</p>}
      </div>
      {Icon && (
        <div className={`shrink-0 rounded-lg p-2.5 ${colorMap[accent]}`}>
          <Icon size={20} />
        </div>
      )}
    </div>
  );
}
