import { TrainFront } from 'lucide-react';

// Compact horizontal "track": one dot per station, a filled line up to where the
// train is, and a marker that slides along the line when the train moves.
// Needs only counts and names, so it can be drawn from the train list alone.

function palette(status) {
  if (status === 'completed') return { fill: 'bg-go-600', ring: 'border-go-600', marker: 'bg-go-600' };
  if (status === 'stopped' || status === 'cancelled')
    return { fill: 'bg-stop-600', ring: 'border-stop-600', marker: 'bg-stop-600' };
  return { fill: 'bg-rail-600', ring: 'border-rail-600', marker: 'bg-rail-600' };
}

export default function RouteTrack({
  count,
  currentIndex,
  origin,
  destination,
  currentStation,
  status,
  labels = true,
}) {
  if (!count) {
    return (
      <div className="flex h-10 items-center">
        <div className="h-0 flex-1 border-t-2 border-dashed border-ink-200" />
        <span className="ml-3 text-sm text-ink-400">No stations yet</span>
      </div>
    );
  }

  const colors = palette(status);
  const last = Math.max(count - 1, 1);
  const position = (index) => `${(index / last) * 100}%`;
  const safeIndex = Math.max(0, currentIndex);

  return (
    <div
      role="img"
      aria-label={`Route progress: ${currentStation ? `at ${currentStation}, ` : ''}stop ${safeIndex + 1} of ${count}`}
    >
      <div className="px-4">
        <div className="relative h-9">
          <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-line" />
          <div
            className={`absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full transition-[width] duration-700 ease-out ${colors.fill}`}
            style={{ width: position(safeIndex) }}
          />
          {Array.from({ length: count }, (_, i) => (
            <span
              key={i}
              className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white ${
                i <= safeIndex ? colors.ring : 'border-ink-200'
              }`}
              style={{ left: position(i) }}
            />
          ))}
          <span
            className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-700 ease-out"
            style={{ left: position(safeIndex) }}
          >
            {status === 'running' && (
              <span
                className={`absolute inset-0 animate-marker-ring rounded-full ${colors.marker}`}
                aria-hidden="true"
              />
            )}
            <span
              className={`relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-white shadow-card ${colors.marker}`}
            >
              <TrainFront className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </span>
        </div>
      </div>
      {labels && (
        <div className="mt-1 flex items-start justify-between gap-4 text-[13px] text-ink-500">
          <span className="min-w-0 max-w-[48%] truncate font-medium" title={origin}>
            {origin}
          </span>
          <span className="min-w-0 max-w-[48%] truncate text-right font-medium" title={destination}>
            {destination}
          </span>
        </div>
      )}
    </div>
  );
}
