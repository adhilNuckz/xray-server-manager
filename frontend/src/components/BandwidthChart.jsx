import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatBitsPerSecond } from '../utils/format';

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-surface-700 bg-surface-900 px-3 py-2 text-xs shadow-lg">
      <p className="text-surface-400 mb-1">{fmtTime(label)}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {formatBitsPerSecond(p.value)}
        </p>
      ))}
    </div>
  );
}

export default function BandwidthChart({ data, series }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={s.color} stopOpacity={0.4} />
              <stop offset="95%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#232a3b" vertical={false} />
        <XAxis dataKey="ts" tickFormatter={fmtTime} stroke="#4c5570" tick={{ fontSize: 11 }} minTickGap={40} />
        <YAxis
          tickFormatter={(v) => formatBitsPerSecond(v)}
          stroke="#4c5570"
          tick={{ fontSize: 11 }}
          width={70}
        />
        <Tooltip content={<CustomTooltip />} />
        {series.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.color}
            fill={`url(#grad-${s.key})`}
            strokeWidth={2}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
