// Global app state, always sourced from the backend (no mock data):
//   trains / stats / events  - refreshed after every change and polled in the background
//   status                   - 'loading' | 'ready' | 'offline'
//   version                  - bumps on every successful refresh so pages that load
//                              their own data (route, schedule, filtered table) can re-sync
//   trainForm                - state of the shared Add/Edit Train dialog

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';

const AppContext = createContext(null);

const POLL_MS = 8000;

export function AppProvider({ children }) {
  const [trains, setTrains] = useState([]);
  const [stats, setStats] = useState(null);
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState('loading');
  const [offlineMessage, setOfflineMessage] = useState('');
  const [version, setVersion] = useState(0);
  const [trainForm, setTrainForm] = useState({ open: false, train: null });

  const latestRequest = useRef(0);

  const reload = useCallback(async () => {
    const requestId = ++latestRequest.current;
    try {
      const [trainData, statData, eventData] = await Promise.all([
        api.listTrains(),
        api.stats(),
        api.events(10),
      ]);
      if (requestId !== latestRequest.current) return; // a newer refresh superseded this one
      setTrains(trainData.trains);
      setStats(statData);
      setEvents(eventData.events);
      setStatus('ready');
      setOfflineMessage('');
      setVersion((v) => v + 1);
    } catch (err) {
      if (requestId !== latestRequest.current) return;
      setStatus('offline');
      setOfflineMessage(err.message);
    }
  }, []);

  // Initial load + background polling (paused while the tab is hidden).
  useEffect(() => {
    reload();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') reload();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload]);

  const openTrainForm = useCallback((train = null) => setTrainForm({ open: true, train }), []);
  const closeTrainForm = useCallback(() => setTrainForm({ open: false, train: null }), []);

  const value = useMemo(
    () => ({
      trains,
      stats,
      events,
      status,
      offlineMessage,
      version,
      reload,
      trainForm,
      openTrainForm,
      closeTrainForm,
    }),
    [trains, stats, events, status, offlineMessage, version, reload, trainForm, openTrainForm, closeTrainForm],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
