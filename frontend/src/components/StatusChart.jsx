import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { STATUS_META, STATUS_ORDER } from '../lib/format.js';

// Donut of how many trains are in each status. The legend beside it repeats the
// numbers as text, so the chart is never the only carrier of the information.
export default function StatusChart({ byStatus, total }) {
  const data = STATUS_ORDER.map((key) => ({
    key,
    label: STATUS_META[key].label,
    value: byStatus?.[key] ?? 0,
    color: STATUS_META[key].chart,
  })).filter((d) => d.value > 0);

  const summary = data.map((d) => `${d.value} ${d.label.toLowerCase()}`).join(', ');

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row xl:flex-col 2xl:flex-row">
      <div
        className="relative h-[170px] w-[170px] shrink-0"
        role="img"
        aria-label={`Train status distribution: ${summary || 'no trains'}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius={54}
              outerRadius={82}
              paddingAngle={data.length > 1 ? 3 : 0}
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.key} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [`${value} ${value === 1 ? 'train' : 'trains'}`, name]}
              contentStyle={{
                borderRadius: 12,
                border: '1px solid #E2E8F0',
                boxShadow: '0 6px 18px -8px rgba(15,30,61,.18)',
                fontSize: 13,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-[34px] font-semibold leading-none tabular-nums">{total}</span>
          <span className="text-[13px] text-ink-500">{total === 1 ? 'train' : 'trains'}</span>
        </div>
      </div>

      <ul className="w-full min-w-0 flex-1 space-y-2">
        {data.map((d) => (
          <li key={d.key} className="flex items-center justify-between gap-3 text-[15px]">
            <span className="flex items-center gap-2.5">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: d.color }} aria-hidden="true" />
              {d.label}
            </span>
            <span className="font-semibold tabular-nums">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
