const TONES = {
  blue: 'bg-rail-50 text-rail-600',
  green: 'bg-go-50 text-go-600',
  amber: 'bg-warn-50 text-warn-600',
  slate: 'bg-canvas text-ink-500',
};

export default function MetricCard({ icon: Icon, label, value, note, tone = 'blue' }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[15px] font-medium text-ink-500">{label}</p>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${TONES[tone]}`}>
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-2 font-display text-[44px] font-semibold leading-none tabular-nums text-ink">{value}</p>
      <p className="mt-2 text-[13px] text-ink-500">{note}</p>
    </div>
  );
}
