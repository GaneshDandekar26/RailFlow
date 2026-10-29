// Thin client for the RailFlow C++ REST API.
//
// Base URL resolution (first match wins):
//   1. a value saved from the About page (localStorage)
//   2. VITE_API_URL at build time (an empty string means "same origin")
//   3. http://localhost:8080

const STORAGE_KEY = 'railflow.apiBase';
const DEFAULT_BASE = 'http://localhost:8080';

export function getApiBase() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved !== null && saved !== '') return saved.replace(/\/+$/, '');
  } catch {
    /* storage unavailable: fall through */
  }
  const env = import.meta.env.VITE_API_URL;
  if (env !== undefined) return String(env).replace(/\/+$/, '');
  return DEFAULT_BASE;
}

export function setApiBase(url) {
  try {
    const clean = (url || '').trim().replace(/\/+$/, '');
    if (clean) window.localStorage.setItem(STORAGE_KEY, clean);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  constructor(message, { status = 0, code = '', field = '', network = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.field = field;
    this.network = network;
  }
}

async function request(method, path, body) {
  const base = getApiBase();
  let response;
  try {
    response = await fetch(`${base}/api${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(
      `Can't reach the RailFlow API at ${base || window.location.origin}. Is the backend running?`,
      { network: true },
    );
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    /* empty or non-JSON body */
  }

  if (!response.ok) {
    const err = data && data.error;
    throw new ApiError(err?.message || `The server returned an error (${response.status}).`, {
      status: response.status,
      code: err?.code || '',
      field: err?.field || '',
    });
  }
  return data;
}

const enc = encodeURIComponent;

export const api = {
  health: () => request('GET', '/health'),
  stats: () => request('GET', '/stats'),
  events: (limit = 10) => request('GET', `/events?limit=${limit}`),
  schedule: () => request('GET', '/schedule'),
  seed: () => request('POST', '/seed'),

  listTrains: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '' && v !== 'all') qs.set(k, v);
    });
    const suffix = qs.toString() ? `?${qs}` : '';
    return request('GET', `/trains${suffix}`);
  },
  createTrain: (number, name) => request('POST', '/trains', { number, name }),
  getTrain: (number) => request('GET', `/trains/${enc(number)}`),
  updateTrain: (number, changes) => request('PATCH', `/trains/${enc(number)}`, changes),
  deleteTrain: (number) => request('DELETE', `/trains/${enc(number)}`),

  getRoute: (number) => request('GET', `/trains/${enc(number)}/route`),
  addStation: (number, station) => request('POST', `/trains/${enc(number)}/stations`, station),
  getStation: (number, index) => request('GET', `/trains/${enc(number)}/stations/${index}`),
  updateStation: (number, index, station) =>
    request('PUT', `/trains/${enc(number)}/stations/${index}`, station),
  removeStation: (number, index) => request('DELETE', `/trains/${enc(number)}/stations/${index}`),

  moveTrain: (number) => request('POST', `/trains/${enc(number)}/move`),
  resetTrain: (number) => request('POST', `/trains/${enc(number)}/reset`),
};
