import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Flag, Layers, LoaderCircle, MapPinned, Plus, TrainFront } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import MetricCard from '../components/MetricCard.jsx';
import RouteTrack from '../components/RouteTrack.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import StatusChart from '../components/StatusChart.jsx';
import EventList from '../components/EventList.jsx';
import EmptyState, { Skeleton } from '../components/EmptyState.jsx';
import { useApp } from '../context/AppContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../lib/api.js';
import { plural } from '../lib/format.js';

function whereIs(train) {
  if (train.stationCount === 0) return 'No stations yet';
  if (train.stationCount === 1) return `Route has one station (${train.currentStation})`;
  if (train.atFinalStation) return `Reached ${train.currentStation}, the final station`;
  if (train.currentIndex === 0) return `Waiting at ${train.currentStation}, next stop ${train.nextStation}`;
  return `At ${train.currentStation}, next stop ${train.nextStation}`;
}

function LoadingState() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[142px] rounded-card" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Skeleton className="h-80 rounded-card xl:col-span-2" />
        <Skeleton className="h-80 rounded-card" />
      </div>
    </div>
  );
}

export default function Overview() {
  const { trains, stats, events, status, reload, openTrainForm } = useApp();
  const toast = useToast();
  const [seeding, setSeeding] = useState(false);

  const loadSamples = async () => {
    setSeeding(true);
    try {
      const { created } = await api.seed();
      toast.success(created > 0 ? `Loaded ${plural(created, 'sample train')}.` : 'Sample trains are already loaded.');
      await reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSeeding(false);
    }
  };

  const header = (
    <PageHeader
      title="Overview"
      description="Where every train is right now, and what has happened on the network."
    />
  );

  if (!stats) {
    return (
      <>
        {header}
        {status === 'offline' ? null : <LoadingState />}
      </>
    );
  }

  const routes = trains.filter((t) => t.stationCount > 0).length;
  const incomplete = stats.byStatus.draft;
  const visibleTrains = trains.slice(0, 6);

  return (
    <>
      {header}

      <section aria-label="Key figures" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={TrainFront}
          label="Total trains"
          value={stats.totalTrains}
          note={incomplete > 0 ? `${plural(incomplete, 'train')} still need a route` : stats.totalTrains > 0 ? 'Every train has a route' : 'None added yet'}
          tone="blue"
        />
        <MetricCard
          icon={Activity}
          label="Active trains"
          value={stats.activeTrains}
          note={`${stats.byStatus.running} running, ${stats.byStatus.scheduled} waiting at origin`}
          tone="green"
        />
        <MetricCard
          icon={Flag}
          label="At final stations"
          value={stats.atFinalStation}
          note="Reached the last station of their route"
          tone="amber"
        />
        <MetricCard
          icon={Layers}
          label="Stations across routes"
          value={stats.totalStations}
          note={routes > 0 ? `${plural(routes, 'route')}, about ${(stats.totalStations / routes).toFixed(1)} stops each` : 'No routes yet'}
          tone="slate"
        />
      </section>

      {stats.totalTrains === 0 ? (
        <section className="card mt-6">
          <EmptyState
            icon={TrainFront}
            title="No trains yet"
            description="Add a train, then build its route station by station. Want to look around first? Load a few sample trains."
          >
            <button type="button" className="btn btn-primary" onClick={() => openTrainForm()}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add train
            </button>
            <button type="button" className="btn btn-secondary" onClick={loadSamples} disabled={seeding}>
              {seeding && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Load sample trains
            </button>
          </EmptyState>
        </section>
      ) : (
        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <section className="card xl:col-span-2" aria-labelledby="route-overview-title">
            <div className="flex items-center justify-between gap-3 px-6 pb-2 pt-5">
              <div>
                <h2 id="route-overview-title" className="text-lg font-semibold">
                  Route overview
                </h2>
                <p className="text-[13px] text-ink-500">The marker shows each train's current station.</p>
              </div>
              <Link to="/tracking" className="btn btn-secondary btn-sm">
                Live tracking
              </Link>
            </div>
            <ul className="divide-y divide-line">
              {visibleTrains.map((train) => (
                <li key={train.number} className="px-6 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <Link
                      to={`/routes/${train.number}`}
                      className="group flex min-w-0 items-baseline gap-2.5 rounded-md"
                    >
                      <span className="font-display text-xl font-semibold tabular-nums text-ink">{train.number}</span>
                      <span className="truncate font-medium text-ink-700 group-hover:text-rail-700">{train.name}</span>
                    </Link>
                    <StatusBadge status={train.status} />
                  </div>
                  <div className="mt-2">
                    <RouteTrack
                      count={train.stationCount}
                      currentIndex={train.currentIndex}
                      origin={train.origin}
                      destination={train.destination}
                      currentStation={train.currentStation}
                      status={train.status}
                    />
                  </div>
                  <p className="mt-1 text-[13px] text-ink-500">
                    <MapPinned className="mr-1 inline h-3.5 w-3.5 -translate-y-px" aria-hidden="true" />
                    {whereIs(train)}
                  </p>
                </li>
              ))}
            </ul>
            {trains.length > visibleTrains.length && (
              <div className="border-t border-line px-6 py-3 text-sm">
                <Link to="/trains" className="font-semibold text-rail-600 hover:text-rail-700">
                  See all {trains.length} trains
                </Link>
              </div>
            )}
          </section>

          <div className="space-y-6">
            <section className="card p-6" aria-labelledby="status-title">
              <h2 id="status-title" className="mb-4 text-lg font-semibold">
                Status of trains
              </h2>
              <StatusChart byStatus={stats.byStatus} total={stats.totalTrains} />
            </section>

            <section className="card p-6" aria-labelledby="events-title">
              <h2 id="events-title" className="mb-4 text-lg font-semibold">
                Recent activity
              </h2>
              {events.length === 0 ? (
                <p className="text-[15px] text-ink-500">
                  Nothing has happened yet. Adding trains and stations, and moving trains, shows up here.
                </p>
              ) : (
                <EventList events={events.slice(0, 6)} />
              )}
            </section>
          </div>
        </div>
      )}
    </>
  );
}
