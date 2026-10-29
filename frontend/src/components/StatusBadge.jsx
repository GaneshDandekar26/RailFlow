import { CircleCheck, CircleDashed, CirclePause, CircleX, Clock3, Navigation } from 'lucide-react';
import { STATUS_META, TONE_CLASSES } from '../lib/format.js';

// Each status has its own icon, so state is never conveyed by colour alone.
const ICONS = {
  draft: CircleDashed,
  scheduled: Clock3,
  running: Navigation,
  completed: CircleCheck,
  stopped: CirclePause,
  cancelled: CircleX,
};

export default function StatusBadge({ status, className = '' }) {
  const meta = STATUS_META[status] ?? STATUS_META.draft;
  const Icon = ICONS[status] ?? CircleDashed;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-semibold ring-1 ring-inset ${TONE_CLASSES[meta.tone]} ${className}`}
      title={meta.hint}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {meta.label}
    </span>
  );
}
