// Shared display helpers: status metadata, time handling, relative dates.

// tone -> Tailwind classes. Green = operational/completed, amber = upcoming,
// red = stopped/cancelled, slate = incomplete route.
export const STATUS_META = {
  draft: { label: 'Draft', tone: 'slate', chart: '#A3AFC3', hint: 'Needs at least two stations' },
  scheduled: { label: 'Scheduled', tone: 'amber', chart: '#E3A008', hint: 'At origin, not yet departed' },
  running: { label: 'Running', tone: 'green', chart: '#1E9E6A', hint: 'Moving along its route' },
  completed: { label: 'Completed', tone: 'green', chart: '#7CCBA6', hint: 'Reached the final station' },
  stopped: { label: 'Stopped', tone: 'red', chart: '#E5484D', hint: 'Halted by an operator' },
  cancelled: { label: 'Cancelled', tone: 'red', chart: '#8F1D1D', hint: 'Cancelled by an operator' },
};

export const STATUS_ORDER = ['running', 'scheduled', 'completed', 'draft', 'stopped', 'cancelled'];

export const TONE_CLASSES = {
  slate: 'bg-canvas text-ink-500 ring-line',
  amber: 'bg-warn-50 text-warn-700 ring-warn-100',
  green: 'bg-go-50 text-go-700 ring-go-100',
  red: 'bg-stop-50 text-stop-700 ring-stop-100',
  blue: 'bg-rail-50 text-rail-700 ring-rail-100',
};

// ---------------------------------------------------------------- times

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTime(text) {
  return TIME_PATTERN.test(text);
}

export function toMinutes(text) {
  if (!isValidTime(text)) return null;
  const [h, m] = text.split(':').map(Number);
  return h * 60 + m;
}

export function formatMinutes(total) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Turns loose input into HH:MM where that is unambiguous: "815" -> "08:15",
// "8:5" -> "08:05", "0815" -> "08:15". Anything else is returned unchanged.
export function normalizeTimeInput(raw) {
  const text = raw.trim();
  if (text === '') return '';
  if (/^\d{3,4}$/.test(text)) {
    const padded = text.padStart(4, '0');
    return `${padded.slice(0, 2)}:${padded.slice(2)}`;
  }
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(text);
  if (match) return `${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')}`;
  return text;
}

export function describeDuration(minutes) {
  if (minutes === null || minutes === undefined) return '';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// ---------------------------------------------------------------- dates

export function formatToday(date = new Date()) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function relativeTime(iso, now = Date.now()) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 45) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(then));
}

export function minutesSinceMidnight(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

export function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many ?? `${one}s`}`;
}
