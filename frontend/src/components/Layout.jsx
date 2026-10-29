import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  CalendarClock,
  Info,
  LayoutDashboard,
  Menu,
  Radio,
  Route,
  TrainFront,
  TriangleAlert,
  X,
} from 'lucide-react';
import Logo from './Logo.jsx';
import TrainFormModal from './TrainFormModal.jsx';
import { useApp } from '../context/AppContext.jsx';
import { getApiBase } from '../lib/api.js';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/trains', label: 'Train Management', icon: TrainFront },
  { to: '/routes', label: 'Route Management', icon: Route },
  { to: '/tracking', label: 'Live Tracking', icon: Radio },
  { to: '/schedule', label: 'Scheduling', icon: CalendarClock },
  { to: '/about', label: 'About', icon: Info },
];

function ConnectionPill() {
  const { status } = useApp();
  const tone =
    status === 'ready'
      ? { dot: 'bg-go-500', text: 'API connected', sub: 'Live data from the C++ backend' }
      : status === 'offline'
        ? { dot: 'bg-stop-500', text: 'API offline', sub: 'Start the backend to continue' }
        : { dot: 'bg-warn-500', text: 'Connecting', sub: 'Contacting the backend' };
  return (
    <div className="rounded-xl border border-line bg-canvas px-3 py-2.5" role="status">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span className={`h-2 w-2 rounded-full ${tone.dot}`} aria-hidden="true" />
        {tone.text}
      </div>
      <p className="mt-0.5 truncate text-[13px] text-ink-500" title={getApiBase() || window.location.origin}>
        {tone.sub}
      </p>
    </div>
  );
}

function SidebarContent({ onNavigate }) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-6 pt-6">
        <Logo />
        <p className="mt-2 text-[13px] text-ink-500">Train scheduling and route management</p>
      </div>
      <nav aria-label="Main" className="flex-1 space-y-1 px-3">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors ${
                isActive
                  ? 'bg-rail-50 font-semibold text-rail-700'
                  : 'font-medium text-ink-500 hover:bg-canvas hover:text-ink'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span
                    className="absolute -left-3 top-2 bottom-2 w-1 rounded-r-full bg-rail-600"
                    aria-hidden="true"
                  />
                )}
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="p-4">
        <ConnectionPill />
      </div>
    </div>
  );
}

function OfflineBanner() {
  const { status, offlineMessage, reload } = useApp();
  if (status !== 'offline') return null;
  return (
    <div
      role="alert"
      className="mb-6 flex flex-col gap-3 rounded-2xl border border-stop-100 bg-stop-50 p-4 sm:flex-row sm:items-center"
    >
      <TriangleAlert className="h-5 w-5 shrink-0 text-stop-600" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-stop-700">The backend isn't responding</p>
        <p className="mt-0.5 text-ink-700">
          {offlineMessage} From the project folder, run{' '}
          <code className="rounded bg-white px-1.5 py-0.5 text-[13px]">./scripts/run-backend.sh</code> or see
          the README.
        </p>
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={reload}>
        Try again
      </button>
    </div>
  );
}

export default function Layout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Close the drawer and jump to the top whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setDrawerOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  return (
    <div className="min-h-screen">
      <a
        href="#content"
        className="sr-only z-[80] rounded-lg bg-white px-4 py-2 font-semibold text-rail-700 shadow-pop focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-white lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <Logo />
        <button
          type="button"
          className="icon-btn h-10 w-10"
          aria-label="Open navigation"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        >
          <Menu className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-pop">
            <button
              type="button"
              className="icon-btn absolute right-3 top-3"
              aria-label="Close navigation"
              onClick={() => setDrawerOpen(false)}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <SidebarContent onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <main id="content" className="lg:pl-64">
        <div className="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <OfflineBanner />
          <Outlet />
        </div>
      </main>

      <TrainFormModal />
    </div>
  );
}
