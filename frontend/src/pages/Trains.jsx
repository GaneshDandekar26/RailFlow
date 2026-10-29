import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  LoaderCircle,
  Pencil,
  Plus,
  Route,
  Search,
  SearchX,
  Trash2,
  TrainFront,
  X,
} from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import EmptyState, { Skeleton } from '../components/EmptyState.jsx';
import { useApp } from '../context/AppContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../lib/api.js';
import { STATUS_META, STATUS_ORDER, plural } from '../lib/format.js';

function locationText(train) {
  if (!train.currentStation) return '—';
  return train.currentStation;
}

function stopText(train) {
  if (train.stationCount < 2 || train.currentIndex < 0) return '';
  return `Stop ${train.currentIndex + 1} of ${train.stationCount}`;
}

export default function Trains() {
  const { trains: allTrains, status: appStatus, version, reload, openTrainForm } = useApp();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const q = params.get('q') ?? '';
  const statusFilter = params.get('status') ?? 'all';
  const sort = params.get('sort') === 'name' ? 'name' : 'number';
  const order = params.get('order') === 'desc' ? 'desc' : 'asc';

  const [search, setSearch] = useState(q);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const setParam = useCallback(
    (key, value, defaultValue) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!value || value === defaultValue) next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // Keep the box in step with the URL (e.g. when arriving from the header search)...
  useEffect(() => setSearch(q), [q]);
  // ...and push typing into the URL after a short pause.
  useEffect(() => {
    if (search === q) return undefined;
    const timer = window.setTimeout(() => setParam('q', search.trim(), ''), 250);
    return () => window.clearTimeout(timer);
  }, [search, q, setParam]);

  // The backend does the searching, filtering and sorting.
  useEffect(() => {
    let cancelled = false;
    api
      .listTrains({ q, status: statusFilter, sort, order })
      .then((data) => {
        if (cancelled) return;
        setRows(data.trains);
        setError('');
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [q, statusFilter, sort, order, version]);

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteTrain(toDelete.number);
      toast.success(`Train ${toDelete.number} deleted.`);
      setToDelete(null);
      await reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const filtersActive = q !== '' || statusFilter !== 'all';
  const clearFilters = () => {
    setSearch('');
    setParams({}, { replace: true });
  };
  const noTrainsAtAll = appStatus === 'ready' && allTrains.length === 0;

  const rowActions = (train) => (
    <div className="flex items-center justify-end gap-1">
      <Link
        to={`/routes/${train.number}`}
        className="btn btn-secondary btn-sm"
        aria-label={`View route of train ${train.number}`}
      >
        <Route className="h-4 w-4" aria-hidden="true" />
        View route
      </Link>
      <button
        type="button"
        className="icon-btn"
        onClick={() => openTrainForm(train)}
        aria-label={`Edit train ${train.number}`}
        title="Edit train"
      >
        <Pencil className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="icon-btn hover:!bg-stop-50 hover:!text-stop-600"
        onClick={() => setToDelete(train)}
        aria-label={`Delete train ${train.number}`}
        title="Delete train"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );

  let body;
  if (error && rows === null) {
    body = (
      <EmptyState icon={SearchX} title="Couldn't load trains" description={error}>
        <button type="button" className="btn btn-secondary" onClick={reload}>
          Try again
        </button>
      </EmptyState>
    );
  } else if (rows === null) {
    body = (
      <div className="space-y-3 p-6" aria-busy="true" aria-label="Loading trains">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  } else if (rows.length === 0 && noTrainsAtAll) {
    body = (
      <EmptyState
        icon={TrainFront}
        title="No trains yet"
        description="Add your first train. You'll build its route on the Route Management page."
      >
        <button type="button" className="btn btn-primary" onClick={() => openTrainForm()}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add train
        </button>
      </EmptyState>
    );
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        icon={SearchX}
        title="No trains match"
        description={
          q
            ? `Nothing matches "${q}"${statusFilter !== 'all' ? ` with status ${STATUS_META[statusFilter]?.label.toLowerCase()}` : ''}. Check the train number or name.`
            : `No trains are ${STATUS_META[statusFilter]?.label.toLowerCase()} right now.`
        }
      >
        <button type="button" className="btn btn-secondary" onClick={clearFilters}>
          Clear filters
        </button>
      </EmptyState>
    );
  } else {
    body = (
      <>
        {/* Table: tablet and up */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[920px] border-collapse">
            <thead>
              <tr className="border-b border-line bg-canvas/60">
                <th scope="col" className="table-head">Train number</th>
                <th scope="col" className="table-head">Train name</th>
                <th scope="col" className="table-head">Starting station</th>
                <th scope="col" className="table-head">Destination</th>
                <th scope="col" className="table-head text-right">Stations</th>
                <th scope="col" className="table-head">Current location</th>
                <th scope="col" className="table-head">Status</th>
                <th scope="col" className="table-head"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((train) => (
                <tr key={train.number} className="transition-colors hover:bg-canvas/60">
                  <td className="px-4 py-3.5 font-display text-xl font-semibold tabular-nums">{train.number}</td>
                  <td className="px-4 py-3.5 font-medium">{train.name}</td>
                  <td className="px-4 py-3.5 text-ink-700">{train.origin ?? '—'}</td>
                  <td className="px-4 py-3.5 text-ink-700">{train.destination ?? '—'}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums">{train.stationCount}</td>
                  <td className="px-4 py-3.5">
                    <span className="font-medium">{locationText(train)}</span>
                    {stopText(train) && <span className="block text-[13px] text-ink-400">{stopText(train)}</span>}
                  </td>
                  <td className="px-4 py-3.5"><StatusBadge status={train.status} /></td>
                  <td className="px-4 py-3.5">{rowActions(train)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Cards: phones */}
        <ul className="divide-y divide-line md:hidden">
          {rows.map((train) => (
            <li key={train.number} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-2xl font-semibold leading-none tabular-nums">{train.number}</p>
                  <p className="mt-1 truncate font-medium">{train.name}</p>
                </div>
                <StatusBadge status={train.status} />
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <dt className="text-ink-400">From</dt>
                  <dd className="font-medium">{train.origin ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-ink-400">To</dt>
                  <dd className="font-medium">{train.destination ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-ink-400">Stations</dt>
                  <dd className="font-medium tabular-nums">{train.stationCount}</dd>
                </div>
                <div>
                  <dt className="text-ink-400">Current location</dt>
                  <dd className="font-medium">{locationText(train)}</dd>
                </div>
              </dl>
              {rowActions(train)}
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Train Management"
        description="Search, filter and manage every train in the system."
        showSearch={false}
      />

      <section className="card overflow-hidden" aria-label="Trains">
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by train number or name"
              aria-label="Search by train number or name"
              className="input pl-9"
            />
            {search && (
              <button
                type="button"
                className="icon-btn absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                aria-label="Clear search"
                onClick={() => setSearch('')}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => setParam('status', e.target.value, 'all')}
              className="input w-auto min-w-[10.5rem]"
            >
              <option value="all">All statuses</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </select>
            <select
              aria-label="Sort by"
              value={sort}
              onChange={(e) => setParam('sort', e.target.value, 'number')}
              className="input w-auto min-w-[10.5rem]"
            >
              <option value="number">Sort by number</option>
              <option value="name">Sort by name</option>
            </select>
            <button
              type="button"
              className="btn btn-secondary h-10 w-10 !px-0"
              onClick={() => setParam('order', order === 'asc' ? 'desc' : 'asc', 'asc')}
              aria-label={order === 'asc' ? 'Sorted ascending. Switch to descending' : 'Sorted descending. Switch to ascending'}
              title={order === 'asc' ? 'Ascending' : 'Descending'}
            >
              {order === 'asc' ? (
                <ArrowUpNarrowWide className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ArrowDownNarrowWide className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {rows !== null && rows.length > 0 && (
          <p className="border-b border-line bg-canvas/50 px-4 py-2 text-[13px] text-ink-500" aria-live="polite">
            {filtersActive ? `${plural(rows.length, 'train')} found` : `${plural(rows.length, 'train')}`}
            {filtersActive && (
              <button type="button" className="ml-3 font-semibold text-rail-600 hover:text-rail-700" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </p>
        )}

        {body}
      </section>

      <ConfirmDialog
        open={Boolean(toDelete)}
        danger
        busy={deleting}
        title={toDelete ? `Delete train ${toDelete.number}?` : ''}
        description={
          toDelete && (
            <>
              <p>
                <strong>{toDelete.name}</strong> and its route of {plural(toDelete.stationCount, 'station')} will be
                removed.
              </p>
              <p className="mt-2 text-ink-500">This can't be undone.</p>
            </>
          )
        }
        confirmLabel={deleting ? 'Deleting' : 'Delete train'}
        onConfirm={confirmDelete}
        onCancel={() => !deleting && setToDelete(null)}
      />
    </>
  );
}
