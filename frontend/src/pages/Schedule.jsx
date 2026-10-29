import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, CircleCheck, Clock3, Search, SearchX, TriangleAlert } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import EmptyState, { Skeleton } from '../components/EmptyState.jsx';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../lib/api.js';
import { formatMinutes, minutesSinceMidnight, plural } from '../lib/format.js';

const SOON_MINUTES = 30;

const POSITION = {
  visited: { label: 'Departed', className: 'text-go-700' },
  current: { label: 'Train is here', className: 'font-semibold text-rail-700' },
  upcoming: { label: 'Upcoming', className: 'text-ink-500' },
};

export default function Schedule() {
  const { version, status, openTrainForm } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [trainFilter, setTrainFilter] = useState('all');
  const [stationQuery, setStationQuery] = useState('');
  const [hideDeparted, setHideDeparted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .schedule()
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError('');
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [version]);

  // Keep the "departs in" hints honest by ticking the clock.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const nowMinutes = minutesSinceMidnight(now);

  const conflictKeys = useMemo(() => {
    const keys = new Set();
    (data?.conflicts ?? []).forEach((c) => {
      keys.add(`${c.a.trainNumber}|${c.a.stationIndex}`);
      keys.add(`${c.b.trainNumber}|${c.b.stationIndex}`);
    });
    return keys;
  }, [data]);

  const trainOptions = useMemo(() => {
    const seen = new Map();
    (data?.entries ?? []).forEach((e) => seen.set(e.trainNumber, e.trainName));
    return [...seen.entries()];
  }, [data]);

  const rows = useMemo(() => {
    const query = stationQuery.trim().toLowerCase();
    return (data?.entries ?? []).filter(
      (e) =>
        (trainFilter === 'all' || e.trainNumber === trainFilter) &&
        (!query || e.station.toLowerCase().includes(query)) &&
        (!hideDeparted || e.state !== 'visited'),
    );
  }, [data, trainFilter, stationQuery, hideDeparted]);

  const header = (
    <PageHeader
      title="Scheduling"
      description="Every planned stop in time order, with platform conflicts flagged."
    />
  );

  if (error && !data) {
    return (
      <>
        {header}
        <section className="card">
          <EmptyState icon={TriangleAlert} title="Couldn't load the schedule" description={error} />
        </section>
      </>
    );
  }
  if (!data) {
    return (
      <>
        {header}
        {status !== 'offline' && (
          <div className="space-y-4" aria-busy="true" aria-label="Loading schedule">
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-80 rounded-card" />
          </div>
        )}
      </>
    );
  }
  if (data.entries.length === 0) {
    return (
      <>
        {header}
        <section className="card">
          <EmptyState
            icon={CalendarClock}
            title="Nothing scheduled yet"
            description="The timetable fills in as stations are added to train routes."
          >
            <button type="button" className="btn btn-primary" onClick={() => openTrainForm()}>
              Add train
            </button>
          </EmptyState>
        </section>
      </>
    );
  }

  const conflicts = data.conflicts;

  return (
    <>
      {header}

      <section className="card mb-6 grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0" aria-label="Schedule summary">
        <div className="p-5">
          <p className="text-[15px] text-ink-500">Planned stops</p>
          <p className="font-display text-4xl font-semibold tabular-nums">{data.entries.length}</p>
          <p className="text-[13px] text-ink-500">across {plural(trainOptions.length, 'train')}</p>
        </div>
        <div className="p-5">
          <p className="text-[15px] text-ink-500">Platform conflicts</p>
          <p className={`font-display text-4xl font-semibold tabular-nums ${conflicts.length ? 'text-warn-600' : 'text-go-600'}`}>
            {conflicts.length}
          </p>
          <p className="text-[13px] text-ink-500">{conflicts.length ? 'Need a time change' : 'No overlaps found'}</p>
        </div>
        <div className="p-5">
          <p className="text-[15px] text-ink-500">Time on this device</p>
          <p className="font-display text-4xl font-semibold tabular-nums">{formatMinutes(nowMinutes)}</p>
          <p className="text-[13px] text-ink-500">Used for the "departs in" hints</p>
        </div>
      </section>

      {conflicts.length > 0 ? (
        <section className="mb-6 space-y-3" aria-labelledby="conflicts-title">
          <h2 id="conflicts-title" className="text-lg font-semibold">
            Platform conflicts
          </h2>
          {conflicts.map((c, i) => (
            <div key={i} className="flex gap-3 rounded-2xl border border-warn-100 bg-warn-50 p-4">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warn-600" aria-hidden="true" />
              <div className="min-w-0 text-[15px] text-ink-700">
                <p className="font-semibold text-warn-700">Two trains share {c.station}</p>
                <p className="mt-0.5">
                  <Link className="font-semibold text-rail-700 underline-offset-2 hover:underline" to={`/routes/${c.a.trainNumber}`}>
                    {c.a.trainNumber} {c.a.trainName}
                  </Link>{' '}
                  is there {c.a.arrival} to {c.a.departure}, and{' '}
                  <Link className="font-semibold text-rail-700 underline-offset-2 hover:underline" to={`/routes/${c.b.trainNumber}`}>
                    {c.b.trainNumber} {c.b.trainName}
                  </Link>{' '}
                  is there {c.b.arrival} to {c.b.departure}
                  {c.overlapMinutes > 0 ? `, an overlap of ${plural(c.overlapMinutes, 'minute')}` : ', arriving in the same minute'}.
                  Edit one of the stops on its route page to separate them.
                </p>
              </div>
            </div>
          ))}
        </section>
      ) : (
        <p className="mb-6 flex items-center gap-2 rounded-2xl border border-go-100 bg-go-50 px-4 py-3 text-[15px] font-medium text-go-700">
          <CircleCheck className="h-5 w-5 shrink-0" aria-hidden="true" />
          No platform conflicts. No two trains occupy the same station at overlapping times.
        </p>
      )}

      <section className="card overflow-hidden" aria-label="Timetable">
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
            <input
              type="search"
              className="input pl-9"
              placeholder="Filter by station"
              aria-label="Filter by station"
              value={stationQuery}
              onChange={(e) => setStationQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="input w-auto min-w-[12rem]"
              aria-label="Filter by train"
              value={trainFilter}
              onChange={(e) => setTrainFilter(e.target.value)}
            >
              <option value="all">All trains</option>
              {trainOptions.map(([number, name]) => (
                <option key={number} value={number}>
                  {number} {name}
                </option>
              ))}
            </select>
            <label className="flex cursor-pointer items-center gap-2 text-[15px] font-medium">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-line accent-rail-600"
                checked={hideDeparted}
                onChange={(e) => setHideDeparted(e.target.checked)}
              />
              Hide departed stops
            </label>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No stops match"
            description="Try a different station name or train."
          >
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setStationQuery('');
                setTrainFilter('all');
                setHideDeparted(false);
              }}
            >
              Clear filters
            </button>
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr className="border-b border-line bg-canvas/60">
                  <th scope="col" className="table-head">Arrives</th>
                  <th scope="col" className="table-head">Departs</th>
                  <th scope="col" className="table-head">Train</th>
                  <th scope="col" className="table-head">Station</th>
                  <th scope="col" className="table-head">Position</th>
                  <th scope="col" className="table-head">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((e) => {
                  const minsToDeparture = e.departureMinutes - nowMinutes;
                  const operating = e.trainStatus !== 'cancelled' && e.trainStatus !== 'stopped';
                  const soon = e.state !== 'visited' && operating && minsToDeparture >= 0 && minsToDeparture <= SOON_MINUTES;
                  const conflict = conflictKeys.has(`${e.trainNumber}|${e.stationIndex}`);
                  const position = POSITION[e.state];
                  return (
                    <tr key={`${e.trainNumber}-${e.stationIndex}`} className={soon ? 'bg-warn-50/60' : 'hover:bg-canvas/60'}>
                      <td className="px-4 py-3 font-semibold tabular-nums">{e.arrival}</td>
                      <td className="px-4 py-3 font-semibold tabular-nums">{e.departure}</td>
                      <td className="px-4 py-3">
                        <Link to={`/routes/${e.trainNumber}`} className="group flex items-baseline gap-2">
                          <span className="font-display text-lg font-semibold tabular-nums">{e.trainNumber}</span>
                          <span className="text-ink-700 group-hover:text-rail-700">{e.trainName}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium">{e.station}</td>
                      <td className={`px-4 py-3 text-sm ${position.className}`}>{position.label}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className="flex flex-wrap items-center gap-2">
                          {soon && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-50 px-2.5 py-0.5 font-semibold text-warn-700 ring-1 ring-inset ring-warn-100">
                              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                              {minsToDeparture === 0 ? 'Departs now' : `Departs in ${minsToDeparture} min`}
                            </span>
                          )}
                          {conflict && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-50 px-2.5 py-0.5 font-semibold text-warn-700 ring-1 ring-inset ring-warn-100">
                              <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                              Platform conflict
                            </span>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
