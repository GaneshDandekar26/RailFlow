import { useState } from 'react';
import { CircleCheck, Database, LoaderCircle, Plug, TriangleAlert } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import { useApp } from '../context/AppContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api, getApiBase, setApiBase } from '../lib/api.js';
import { plural } from '../lib/format.js';

// A tiny illustration of the data structure behind every route.
function ListDiagram() {
  const nodes = [
    { name: 'Mumbai', times: '08:00 / 08:15' },
    { name: 'Thane', times: '09:00 / 09:10' },
    { name: 'Kalyan', times: '09:50 / 10:00' },
    { name: 'Pune', times: '12:30 / 12:45' },
  ];
  const currentIndex = 1;
  return (
    <figure>
      <div className="overflow-x-auto pb-2">
        <ol className="flex min-w-[640px] items-stretch gap-0 pt-7">
          {nodes.map((n, i) => (
            <li key={n.name} className="flex items-center">
              <div className="relative">
                {i === 0 && (
                  <span className="absolute -top-6 left-0 text-[13px] font-semibold text-ink-500">head</span>
                )}
                {i === currentIndex && (
                  <span className="absolute -top-6 right-0 rounded-full bg-rail-600 px-2 text-[12px] font-semibold text-white">
                    current
                  </span>
                )}
                {i === nodes.length - 1 && (
                  <span className="absolute -top-6 left-0 text-[13px] font-semibold text-ink-500">tail</span>
                )}
                <div
                  className={`w-36 rounded-xl border-2 bg-white ${i === currentIndex ? 'border-rail-600' : 'border-ink-200'}`}
                >
                  <p className="border-b border-line px-3 py-1.5 font-display text-lg font-semibold uppercase tracking-wide">
                    {n.name}
                  </p>
                  <p className="px-3 py-1 text-[13px] tabular-nums text-ink-500">{n.times}</p>
                  <p className="border-t border-line px-3 py-1 text-[13px] text-ink-500">
                    next {i === nodes.length - 1 ? '= nullptr' : ''}
                  </p>
                </div>
              </div>
              {i < nodes.length - 1 && (
                <svg width="36" height="14" viewBox="0 0 36 14" className="shrink-0 text-ink-400" aria-hidden="true">
                  <path d="M0 7h30M24 2l6 5-6 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </li>
          ))}
        </ol>
      </div>
      <figcaption className="mt-2 text-[13px] text-ink-500">
        Example route. Each box is a <code>Station</code> node created with <code>new</code>; its{' '}
        <code>next</code> pointer leads to the following stop. Moving the train sets the current pointer to
        <code> current-&gt;next</code>.
      </figcaption>
    </figure>
  );
}

export default function About() {
  const { stats, reload, status } = useApp();
  const toast = useToast();
  const [baseInput, setBaseInput] = useState(getApiBase());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [seeding, setSeeding] = useState(false);

  const saveAndTest = async () => {
    setApiBase(baseInput);
    setTesting(true);
    setTestResult(null);
    try {
      await api.health();
      setTestResult({ ok: true, message: `Connected to ${getApiBase() || window.location.origin}.` });
      await reload();
    } catch (err) {
      setTestResult({ ok: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  const loadSamples = async () => {
    setSeeding(true);
    try {
      const { created, skipped } = await api.seed();
      toast.success(
        created > 0
          ? `Loaded ${plural(created, 'sample train')}${skipped ? ` (${skipped} already existed)` : ''}.`
          : 'The sample trains are already loaded.',
      );
      await reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <>
      <PageHeader
        title="About RailFlow"
        description="How routes are modelled, where the data lives and how this page talks to the backend."
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <section className="card p-6" aria-labelledby="model-title">
            <h2 id="model-title" className="text-lg font-semibold">
              How a route is stored
            </h2>
            <p className="mb-5 mt-1 max-w-2xl text-[15px] text-ink-700">
              The C++ backend keeps every route as a singly linked list. The train holds a pointer to the first
              station, a pointer to the last one, and a pointer to the station it is at now.
            </p>
            <ListDiagram />
          </section>

          <section className="card p-6" aria-labelledby="notes-title">
            <h2 id="notes-title" className="text-lg font-semibold">
              Good to know
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] text-ink-700 marker:text-ink-300">
              <li>
                Data lives in the backend's memory only. Stopping the backend clears every train, station and event.
              </li>
              <li>Times are 24-hour HH:MM and belong to a single day. A journey can't cross midnight.</li>
              <li>
                A station's arrival can't be earlier than the previous station's departure, and its departure can't be
                earlier than its own arrival.
              </li>
              <li>Stations are added after the last stop. Existing stations can be edited or removed.</li>
              <li>The station a train is currently at can't be removed. Move the train first.</li>
              <li>Train numbers are 3 to 6 digits and unique. Station names are unique within one route.</li>
            </ul>
          </section>
        </div>

        <div className="min-w-0 space-y-6">
          <section className="card p-6" aria-labelledby="conn-title">
            <h2 id="conn-title" className="text-lg font-semibold">
              Backend connection
            </h2>
            <label htmlFor="api-base" className="field-label mt-4">
              API address
            </label>
            <input
              id="api-base"
              className="input"
              value={baseInput}
              onChange={(e) => setBaseInput(e.target.value)}
              placeholder="http://localhost:8080"
              spellCheck={false}
              autoComplete="off"
            />
            <p className="field-hint">
              Saved in this browser. Leave it empty to use the address the page was served from.
            </p>
            <button type="button" className="btn btn-primary mt-4 w-full" onClick={saveAndTest} disabled={testing}>
              {testing ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plug className="h-4 w-4" aria-hidden="true" />
              )}
              Save and test connection
            </button>
            {testResult && (
              <p
                role="status"
                className={`mt-3 flex items-start gap-2 text-sm font-medium ${testResult.ok ? 'text-go-700' : 'text-stop-700'}`}
              >
                {testResult.ok ? (
                  <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                ) : (
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                {testResult.message}
              </p>
            )}
            {!testResult && (
              <p className="mt-3 text-sm text-ink-500">
                Currently {status === 'ready' ? 'connected' : status === 'offline' ? 'not connected' : 'connecting'}.
              </p>
            )}
          </section>

          <section className="card p-6" aria-labelledby="sample-title">
            <h2 id="sample-title" className="text-lg font-semibold">
              Sample data
            </h2>
            <p className="mt-1 text-[15px] text-ink-700">
              Load three example trains with routes to explore the app. Trains that already exist are left alone.
            </p>
            <button type="button" className="btn btn-secondary mt-4 w-full" onClick={loadSamples} disabled={seeding}>
              {seeding ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Database className="h-4 w-4" aria-hidden="true" />
              )}
              Load sample trains
            </button>
            {stats && (
              <p className="mt-3 text-sm text-ink-500">
                The backend currently holds {plural(stats.totalTrains, 'train')} and{' '}
                {plural(stats.totalStations, 'station')}.
              </p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
