import {
  ArrowRight,
  Database,
  Flag,
  MapPin,
  MapPinOff,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { relativeTime } from '../lib/format.js';

const EVENT_STYLE = {
  train_created: { icon: Plus, tone: 'bg-rail-50 text-rail-600' },
  train_updated: { icon: Pencil, tone: 'bg-canvas text-ink-500' },
  train_deleted: { icon: Trash2, tone: 'bg-stop-50 text-stop-600' },
  station_added: { icon: MapPin, tone: 'bg-rail-50 text-rail-600' },
  station_updated: { icon: Pencil, tone: 'bg-canvas text-ink-500' },
  station_removed: { icon: MapPinOff, tone: 'bg-stop-50 text-stop-600' },
  train_moved: { icon: ArrowRight, tone: 'bg-go-50 text-go-600' },
  train_reached_final: { icon: Flag, tone: 'bg-go-50 text-go-700' },
  train_reset: { icon: RotateCcw, tone: 'bg-warn-50 text-warn-600' },
  sample_data: { icon: Database, tone: 'bg-canvas text-ink-500' },
};

export default function EventList({ events }) {
  return (
    <ul className="divide-y divide-line">
      {events.map((e) => {
        const style = EVENT_STYLE[e.type] ?? EVENT_STYLE.train_updated;
        const Icon = style.icon;
        return (
          <li key={e.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
            <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.tone}`}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] leading-snug text-ink">{e.message}</p>
              <p className="mt-0.5 text-[13px] text-ink-400">{relativeTime(e.timestamp)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
