import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight,
  CirclePlay,
  LoaderCircle,
  MapPinPlus,
  Pencil,
  Plus,
  RotateCcw,
  Route as RouteIcon,
  SearchX,
  TriangleAlert,
} from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import RouteTrack from '../components/RouteTrack.jsx';
import StationTimeline from '../components/StationTimeline.jsx';
import AddStationPanel from '../components/AddStationPanel.jsx';
import { EditStationDialog, StationDetailsDialog } from '../components/StationDialogs.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import EmptyState, { Skeleton } from '../components/EmptyState.jsx';
import { useApp } from '../context/AppContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../lib/api.js';
import { plural } from '../lib/format.js';

// ----------------------------------------------------------------- picker

function RoutePicker() {
  const { trains, status, openTrainForm } = useApp();

  return (
    <>
      <PageHeader
        title="Route Management"
        description="Choose a train to see its route, add stations and move it along."
      />
      {status === 'loading' ? (
        <div className="grid gap-4 md:grid-cols-2" aria-busy="true">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-40 rounded-card" />
          ))}
        </div>
      ) : trains.length === 0 ? (
        <section className="card">
          <EmptyState
            icon={RouteIcon}
            title="No trains to manage yet"
            description="Add a train first. Its route is built here, one station at a time."
          >
            <button type="button" className="btn btn-primary" onClick={() => openTrainForm()}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add train
            </button>
          </EmptyState>
        </section>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {trains.map((t) => (
            <li key={t.number}>
              <Link
                to={`/routes/${t.number}`}
                className="card block p-5 transition-shadow hover:shadow-pop"
                aria-label={`Open route of train ${t.number}, ${t.name}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-2xl font-semibold leading-none tabular-nums">{t.number}</p>
                    <p className="mt-1 truncate font-medium text-ink-700">{t.name}</p>
                  </div>
                  <StatusBadge status={t.status} />
                </div>
                <div className="mt-3">
                  <RouteTrack
                    count={t.stationCount}
                    currentIndex={t.currentIndex}
                    origin={t.origin}
                    destination={t.destination}
                    currentStation={t.currentStation}
                    status={t.status}
                  />
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-rail-600">
                  Open route
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ----------------------------------------------------------------- detail

function moveBlockedReason(train) {
  if (train.stationCount < 2) return 'Add at least two stations before the train can move.';
  if (train.atFinalStation) return `The train is at its final station, ${train.currentStation}.`;
  return '';
}

function RouteDetail({ number }) {
  const { trains, version, reload, openTrainForm } = useApp();
  const toast = useToast();
  const navigate = useNavigate();

  const [route, setRoute] = useState(null);
  const [problem, setProblem] = useState(null); // { message, notFound }
  const [knownStations, setKnownStations] = useState([]);
  const [busyAction, setBusyAction] = useState('');
  const [detailsFor, setDetailsFor] = useState(null);
  const [editFor, setEditFor] = useState(null);
  const [removeFor, setRemoveFor] = useState(null);
  const [removing, setRemoving] = useState(false);

  // Load the route (and station names used for autocomplete) from the backend.
  useEffect(() => {
    let cancelled = false;
    api
      .getRoute(number)
      .then((data) => {
        if (cancelled) return;
        setRoute(data);
        setProblem(null);
      })
      .catch((err) => !cancelled && setProblem({ message: err.message, notFound: err.status === 404 }));
    api
      .schedule()
      .then((data) => {
        if (cancelled) return;
        const names = [...new Set(data.entries.map((e) => e.station))].sort((a, b) => a.localeCompare(b));
        setKnownStations(names);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [number, version]);

  const applyRoute = useCallback(
    (data) => {
      setRoute(data);
      reload();
    },
    [reload],
  );

  const run = async (key, action, onDone) => {
    setBusyAction(key);
    try {
      const data = await action();
      onDone?.(data);
      applyRoute(data);
    } catch (err) {
      toast.error(err.message);
      reload();
    } finally {
      setBusyAction('');
    }
  };

  const moveNext = () =>
    run('move', () => api.moveTrain(number), (data) => {
      const t = data.train;
      toast.success(
        t.atFinalStation
          ? `Train ${t.number} reached ${t.currentStation}, its final station.`
          : `Train ${t.number} moved to ${t.currentStation}.`,
      );
    });

  const resetTrain = () =>
    run('reset', () => api.resetTrain(number), (data) =>
      toast.success(`Train ${data.train.number} is back at ${data.train.currentStation}.`),
    );

  const resume = async () => {
    setBusyAction('resume');
    try {
      await api.updateTrain(number, { operational: 'normal' });
      toast.success(`Train ${number} is running normally again.`);
      await reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyAction('');
    }
  };

  const confirmRemove = async () => {
    setRemoving(true);
    try {
      const data = await api.removeStation(number, removeFor.index);
      toast.success(`Removed ${removeFor.name} from train ${number}.`);
      setRemoveFor(null);
      applyRoute(data);
    } catch (err) {
      toast.error(err.message);
      setRemoveFor(null);
      reload();
    } finally {
      setRemoving(false);
    }
  };

  const focusAddStation = () => {
    const panel = document.getElementById('add-station');
    panel?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    panel?.querySelector('input')?.focus({ preventScroll: true });
  };

  const stations = route?.stations ?? [];
  const train = route?.train;
  const halted = train ? train.operational !== 'normal' : false;
  const reason = useMemo(() => (train && !halted ? moveBlockedReason(train) : ''), [train, halted]);

  const header = (
    <PageHeader
      title="Route Management"
      description="Build a route station by station and move the train along it."
    />
  );

  if (problem && !route) {
    return (
      <>
        {header}
        <section className="card">
          <EmptyState
            icon={problem.notFound ? SearchX : TriangleAlert}
            title={problem.notFound ? `Train ${number} doesn't exist` : "Couldn't load this route"}
            description={
              problem.notFound
                ? 'It may have been deleted or renumbered. Pick another train from the list.'
                : problem.message
            }
          >
            <Link to="/routes" className="btn btn-primary">
              Choose a train
            </Link>
          </EmptyState>
        </section>
      </>
    );
  }

  if (!route) {
    return (
      <>
        {header}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]" aria-busy="true" aria-label="Loading route">
          <div className="space-y-6">
            <Skeleton className="h-44 rounded-card" />
            <Skeleton className="h-96 rounded-card" />
          </div>
          <Skeleton className="h-96 rounded-card" />
        </div>
      </>
    );
  }

  const mayLive = train.status === 'running' || train.status === 'scheduled';

  return (
    <>
      {header}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          {/* Train summary and controls */}
          <section className="card p-5 sm:p-6" aria-label={`Train ${train.number}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-display text-4xl font-semibold leading-none tabular-nums">{train.number}</h2>
                  <StatusBadge status={train.status} />
                </div>
                <p className="mt-1.5 truncate text-lg font-medium text-ink-700">{train.name}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="train-switch">
                  Switch train
                </label>
                <select
                  id="train-switch"
                  value={train.number}
                  onChange={(e) => navigate(`/routes/${e.target.value}`)}
                  className="input w-auto max-w-[17rem]"
                >
                  {trains.map((t) => (
                    <option key={t.number} value={t.number}>
                      {t.number} {t.name}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn-secondary btn-sm h-10" onClick={() => openTrainForm(train)}>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Edit train
                </button>
              </div>
            </div>

            <div className="mt-5">
              <RouteTrack
                count={train.stationCount}
                currentIndex={train.currentIndex}
                origin={train.origin}
                destination={train.destination}
                currentStation={train.currentStation}
                status={train.status}
              />
            </div>

            {(train.operational === 'stopped' || train.operational === 'cancelled') && (
              <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-stop-100 bg-stop-50 px-4 py-3">
                <TriangleAlert className="h-5 w-5 shrink-0 text-stop-600" aria-hidden="true" />
                <p className="min-w-0 flex-1 text-sm font-medium text-stop-700">
                  This train is {train.operational}. It can't move until it runs normally again.
                </p>
                <button type="button" className="btn btn-secondary btn-sm" onClick={resume} disabled={busyAction === 'resume'}>
                  {busyAction === 'resume' && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Resume operation
                </button>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-5">
              <button
                type="button"
                className="btn btn-primary"
                onClick={moveNext}
                disabled={halted || Boolean(reason) || busyAction !== ''}
              >
                {busyAction === 'move' ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <CirclePlay className="h-4 w-4" aria-hidden="true" />
                )}
                {train.nextStation ? `Move to ${train.nextStation}` : 'Move to next station'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={resetTrain}
                disabled={train.stationCount === 0 || train.currentIndex === 0 || busyAction !== ''}
              >
                {busyAction === 'reset' ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                )}
                Reset to origin
              </button>
              {reason && <p className="min-w-0 flex-1 text-sm text-ink-500">{reason}</p>}
            </div>
          </section>

          {/* Timeline */}
          <section className="card overflow-hidden" aria-labelledby="timeline-title">
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-3 pt-5">
              <div>
                <h2 id="timeline-title" className="text-lg font-semibold">
                  Route
                </h2>
                <p className="text-[13px] text-ink-500">
                  {train.stationCount === 0
                    ? 'No stations yet'
                    : `${plural(train.stationCount, 'station')}, ${train.origin} to ${train.destination}`}
                </p>
              </div>
              <button type="button" className="btn btn-secondary btn-sm xl:hidden" onClick={focusAddStation}>
                <MapPinPlus className="h-4 w-4" aria-hidden="true" />
                Add station
              </button>
            </div>
            {stations.length === 0 ? (
              <EmptyState
                icon={MapPinPlus}
                title="This route has no stations"
                description="Add the origin first, then each stop in order. Each new station is added after the last one."
                className="pt-6"
              >
                <button type="button" className="btn btn-primary" onClick={focusAddStation}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add the first station
                </button>
              </EmptyState>
            ) : (
              <StationTimeline
                stations={stations}
                live={mayLive}
                onDetails={setDetailsFor}
                onEdit={setEditFor}
                onRemove={setRemoveFor}
              />
            )}
          </section>
        </div>

        <div className="xl:sticky xl:top-6">
          <AddStationPanel
            key={train.number}
            train={train}
            stations={stations}
            knownStations={knownStations}
            onAdded={applyRoute}
          />
        </div>
      </div>

      {detailsFor && (
        <StationDetailsDialog train={train} station={detailsFor} stations={stations} onClose={() => setDetailsFor(null)} />
      )}
      {editFor && (
        <EditStationDialog
          train={train}
          station={editFor}
          stations={stations}
          onClose={() => setEditFor(null)}
          onSaved={applyRoute}
        />
      )}
      <ConfirmDialog
        open={Boolean(removeFor)}
        danger
        busy={removing}
        title={removeFor ? `Remove ${removeFor.name}?` : ''}
        description={
          removeFor && (
            <>
              <p>
                {removeFor.name} will be taken off the route of train {train.number}. The other stations keep their
                order and times.
              </p>
            </>
          )
        }
        confirmLabel={removing ? 'Removing' : 'Remove station'}
        onConfirm={confirmRemove}
        onCancel={() => !removing && setRemoveFor(null)}
      />
    </>
  );
}

export default function Routes() {
  const { number } = useParams();
  return number ? <RouteDetail key={number} number={number} /> : <RoutePicker />;
}
