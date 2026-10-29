import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CirclePlay, LoaderCircle, Pause, Play, Plus, RotateCcw, Radio } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import RouteTrack from '../components/RouteTrack.jsx';
import EmptyState, { Skeleton } from '../components/EmptyState.jsx';
import { useApp } from '../context/AppContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../lib/api.js';

const ADVANCE_MS = 5000;
const SORT_RANK = { running: 0, scheduled: 1, completed: 2, draft: 3, stopped: 4, cancelled: 5 };

function nextStopText(train) {
  if (train.stationCount < 2) return 'Needs at least two stations';
  if (train.operational === 'stopped') return 'Stopped by an operator';
  if (train.operational === 'cancelled') return 'Cancelled by an operator';
  if (train.atFinalStation) return 'Journey complete';
  return `Next stop ${train.nextStation}`;
}

function canMove(train) {
  return train.operational === 'normal' && train.stationCount >= 2 && !train.atFinalStation;
}

export default function Tracking() {
  const { trains, status, reload, openTrainForm } = useApp();
  const toast = useToast();
  const [auto, setAuto] = useState(false);
  const [busy, setBusy] = useState({});
  const trainsRef = useRef(trains);
  trainsRef.current = trains;

  const sorted = useMemo(
    () => [...trains].sort((a, b) => SORT_RANK[a.status] - SORT_RANK[b.status] || a.number.localeCompare(b.number, undefined, { numeric: true })),
    [trains],
  );
  const movableCount = trains.filter(canMove).length;

  // Auto-advance: every few seconds each movable train takes a real step through the backend.
  useEffect(() => {
    if (!auto) return undefined;
    const timer = window.setInterval(async () => {
      const movable = trainsRef.current.filter(canMove);
      if (movable.length === 0) {
        setAuto(false);
        toast.info('No train can move any further, so auto-advance stopped.');
        return;
      }
      const results = await Promise.allSettled(movable.map((t) => api.moveTrain(t.number)));
      if (results.some((r) => r.status === 'rejected' && r.reason?.network)) {
        setAuto(false);
        toast.error("Lost contact with the backend, so auto-advance stopped.");
      }
      reload();
    }, ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [auto, reload, toast]);

  const act = async (train, kind) => {
    setBusy((b) => ({ ...b, [train.number]: kind }));
    try {
      const data = kind === 'move' ? await api.moveTrain(train.number) : await api.resetTrain(train.number);
      const t = data.train;
      if (kind === 'move') {
        toast.success(
          t.atFinalStation
            ? `Train ${t.number} reached ${t.currentStation}, its final station.`
            : `Train ${t.number} moved to ${t.currentStation}.`,
        );
      } else {
        toast.success(`Train ${t.number} is back at ${t.currentStation}.`);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy((b) => ({ ...b, [train.number]: '' }));
      reload();
    }
  };

  return (
    <>
      <PageHeader
        title="Live Tracking"
        description="Follow each train along its route and move it one station at a time."
      />

      {status === 'loading' && (
        <div className="grid gap-4 xl:grid-cols-2" aria-busy="true">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-60 rounded-card" />
          ))}
        </div>
      )}

      {status !== 'loading' && trains.length === 0 && (
        <section className="card">
          <EmptyState
            icon={Radio}
            title="No trains to track"
            description="Once a train has a route you can watch it move here."
          >
            <button type="button" className="btn btn-primary" onClick={() => openTrainForm()}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add train
            </button>
          </EmptyState>
        </section>
      )}

      {trains.length > 0 && (
        <>
          <section className="card mb-6 flex flex-wrap items-center gap-4 p-4 sm:px-5">
            <button
              type="button"
              role="switch"
              aria-checked={auto}
              onClick={() => setAuto((v) => !v)}
              disabled={!auto && movableCount === 0}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                auto ? 'bg-rail-600' : 'bg-ink-200'
              }`}
              aria-label="Auto-advance trains"
            >
              <span
                className={`absolute left-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-card transition-transform ${
                  auto ? 'translate-x-5' : ''
                }`}
              >
                {auto ? <Pause className="h-3 w-3 text-rail-600" aria-hidden="true" /> : <Play className="h-3 w-3 text-ink-400" aria-hidden="true" />}
              </span>
            </button>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Auto-advance {auto ? 'is on' : 'is off'}</p>
              <p className="text-[13px] text-ink-500">
                {movableCount === 0
                  ? 'No train can move right now.'
                  : `Moves ${movableCount === 1 ? 'the 1 train that can move' : `all ${movableCount} trains that can move`} one station every ${ADVANCE_MS / 1000} seconds. Each step is a real request to the backend.`}
              </p>
            </div>
          </section>

          <ul className="grid gap-4 xl:grid-cols-2">
            {sorted.map((train) => {
              const working = busy[train.number];
              return (
                <li key={train.number}>
                  <article className="card h-full p-5 sm:p-6" aria-label={`Train ${train.number}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-2xl font-semibold leading-none tabular-nums">{train.number}</p>
                        <p className="mt-1 truncate font-medium text-ink-700">{train.name}</p>
                      </div>
                      <StatusBadge status={train.status} />
                    </div>

                    <div className="mt-5">
                      <p className="text-[13px] text-ink-500">
                        {train.stationCount === 0 ? 'Location' : train.atFinalStation ? 'Arrived at' : train.currentIndex === 0 ? 'Waiting at' : 'Now at'}
                      </p>
                      <p className="font-display text-[32px] font-semibold uppercase leading-tight tracking-wide">
                        {train.currentStation ?? 'No route yet'}
                      </p>
                      <p className="text-[15px] text-ink-500">
                        {nextStopText(train)}
                        {train.stationCount >= 2 && (
                          <span className="text-ink-400">
                            {' '}
                            (stop {train.currentIndex + 1} of {train.stationCount})
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="mt-4">
                      <RouteTrack
                        count={train.stationCount}
                        currentIndex={train.currentIndex}
                        origin={train.origin}
                        destination={train.destination}
                        currentStation={train.currentStation}
                        status={train.status}
                      />
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => act(train, 'move')}
                        disabled={!canMove(train) || Boolean(working)}
                      >
                        {working === 'move' ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <CirclePlay className="h-4 w-4" aria-hidden="true" />
                        )}
                        Move to next
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => act(train, 'reset')}
                        disabled={train.stationCount === 0 || train.currentIndex === 0 || Boolean(working)}
                      >
                        {working === 'reset' ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        )}
                        Reset
                      </button>
                      <Link to={`/routes/${train.number}`} className="btn btn-ghost btn-sm ml-auto">
                        Open route
                      </Link>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
