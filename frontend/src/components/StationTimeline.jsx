import { Check, Eye, Flag, Pencil, Trash2, TrainFront } from 'lucide-react';
import { describeDuration } from '../lib/format.js';

// Vertical route timeline. Each row is one node of the backend's linked list:
//   visited  -> green node, solid green connector behind it
//   current  -> large blue node with the CURRENT LOCATION badge
//   upcoming -> hollow node, dashed grey connector
// The final station carries a flag in addition to its state.

function Node({ station, live }) {
  if (station.state === 'current') {
    return (
      <span className="relative flex h-10 w-10 items-center justify-center">
        {live && <span className="absolute inset-0 animate-marker-ring rounded-full bg-rail-600" aria-hidden="true" />}
        <span className="relative flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-white bg-rail-600 text-white shadow-card">
          <TrainFront className="h-5 w-5" aria-hidden="true" />
        </span>
      </span>
    );
  }
  if (station.state === 'visited') {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-go-600 text-white">
        {station.isFinal ? (
          <Flag className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
        )}
      </span>
    );
  }
  return (
    <span
      className={`flex h-7 w-7 items-center justify-center rounded-full border-2 bg-white ${
        station.isFinal ? 'border-ink-400 text-ink-500' : 'border-ink-200'
      }`}
    >
      {station.isFinal && <Flag className="h-3.5 w-3.5" aria-hidden="true" />}
    </span>
  );
}

function Tag({ children }) {
  return (
    <span className="rounded-full bg-canvas px-2.5 py-0.5 text-[12px] font-semibold text-ink-500 ring-1 ring-inset ring-line">
      {children}
    </span>
  );
}

const STATE_TEXT = { visited: 'Visited', current: 'Current location', upcoming: 'Upcoming' };

export default function StationTimeline({ stations, live, onDetails, onEdit, onRemove }) {
  return (
    <ol className="px-3 pb-3 sm:px-5">
      {stations.map((s, i) => {
        const prev = stations[i - 1];
        const isLast = i === stations.length - 1;
        const current = s.state === 'current';
        const travelled = (st) => st && st.state === 'visited';
        const line = (on) => (on ? 'bg-go-600' : 'track-dashed');
        const dwell = s.dwellMinutes;

        return (
          <li key={`${s.index}-${s.name}`} className="relative flex gap-3 sm:gap-4">
            {/* Node column with the connector segments above and below the node */}
            <div className="relative flex w-10 shrink-0 justify-center">
              {i > 0 && (
                <span className={`absolute left-1/2 top-0 h-8 w-0.5 -translate-x-1/2 ${line(travelled(prev))}`} aria-hidden="true" />
              )}
              {!isLast && (
                <span className={`absolute bottom-0 left-1/2 top-8 w-0.5 -translate-x-1/2 ${line(travelled(s))}`} aria-hidden="true" />
              )}
              <div className="relative z-10 mt-3 flex h-10 items-center justify-center">
                <Node station={s} live={live} />
              </div>
            </div>

            <div
              className={`my-1 min-w-0 flex-1 rounded-xl px-4 py-3 ${
                current ? 'bg-rail-50 ring-1 ring-inset ring-rail-100' : ''
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-[22px] font-semibold uppercase leading-tight tracking-wide text-ink">
                      {s.name}
                    </h3>
                    {current && (
                      <span className="rounded-full bg-rail-600 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
                        Current location
                      </span>
                    )}
                    {s.isOrigin && <Tag>Origin</Tag>}
                    {s.isFinal && <Tag>Final station</Tag>}
                    {!current && <span className="sr-only">{STATE_TEXT[s.state]}</span>}
                  </div>
                  <p className="mt-1 flex flex-wrap gap-x-5 gap-y-0.5 text-[15px] tabular-nums text-ink-700">
                    <span>
                      <span className="text-ink-400">Arrival</span> <strong className="font-semibold">{s.arrival}</strong>
                    </span>
                    <span>
                      <span className="text-ink-400">Departure</span> <strong className="font-semibold">{s.departure}</strong>
                    </span>
                    {dwell > 0 && <span className="text-ink-400">Stops {describeDuration(dwell)}</span>}
                  </p>
                  {prev && s.travelMinutesFromPrevious !== null && (
                    <p className="mt-0.5 text-[13px] text-ink-400">
                      {describeDuration(s.travelMinutesFromPrevious)} from {prev.name}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => onDetails(s)}
                    aria-label={`View details of ${s.name}`}
                    title="View details"
                  >
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => onEdit(s)}
                    aria-label={`Edit ${s.name}`}
                    title="Edit station"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="icon-btn hover:!bg-stop-50 hover:!text-stop-600"
                    onClick={() => onRemove(s)}
                    disabled={current}
                    aria-label={current ? `${s.name} can't be removed while the train is there` : `Remove ${s.name}`}
                    title={current ? "The train is here, so this station can't be removed" : 'Remove station'}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
