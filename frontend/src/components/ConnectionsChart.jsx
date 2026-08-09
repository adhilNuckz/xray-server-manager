import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function ConnectionsChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#232a3b" vertical={false} />
        <XAxis dataKey="ts" tickFormatter={fmtTime} stroke="#4c5570" tick={{ fontSize: 11 }} minTickGap={40} />
        <YAxis allowDecimals={false} stroke="#4c5570" tick={{ fontSize: 11 }} width={30} />
        <Tooltip
          labelFormatter={fmtTime}
          contentStyle={{ background: '#161c29', border: '1px solid #232a3b', borderRadius: 8, fontSize: 12 }}
        />
        <Line
          type="monotone"
          dataKey="activeConnections"
          name="Active connections"
          stroke="#6366f1"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
