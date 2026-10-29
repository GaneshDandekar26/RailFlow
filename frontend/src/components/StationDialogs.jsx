import { useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import Modal from './Modal.jsx';
import { TextField, TimeField } from './Fields.jsx';
import { Skeleton } from './EmptyState.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../lib/api.js';
import { describeDuration } from '../lib/format.js';
import { validateStation } from '../lib/validators.js';

// ---------------------------------------------------------------- edit

export function EditStationDialog({ train, station, stations, onClose, onSaved }) {
  const toast = useToast();
  const [name, setName] = useState(station.name);
  const [arrival, setArrival] = useState(station.arrival);
  const [departure, setDeparture] = useState(station.departure);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const nameRef = useRef(null);
  const arrivalRef = useRef(null);
  const departureRef = useRef(null);

  const prev = stations[station.index - 1];
  const next = stations[station.index + 1];

  const submit = async (event) => {
    event.preventDefault();
    setFormError('');
    const found = validateStation(
      { name, arrival, departure },
      {
        prev: prev ? { name: prev.name, departure: prev.departure } : null,
        next: next ? { name: next.name, arrival: next.arrival } : null,
        others: stations.filter((s) => s.index !== station.index).map((s) => s.name),
      },
    );
    setErrors(found);
    if (found.name) return nameRef.current?.focus();
    if (found.arrival) return arrivalRef.current?.focus();
    if (found.departure) return departureRef.current?.focus();

    setBusy(true);
    try {
      const route = await api.updateStation(train.number, station.index, { name: name.trim(), arrival, departure });
      toast.success(`Saved ${name.trim()}.`);
      onSaved(route);
      onClose();
    } catch (err) {
      if (['name', 'arrival', 'departure'].includes(err.field)) setErrors({ [err.field]: err.message });
      else setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      busy={busy}
      title={`Edit ${station.name}`}
      description={`Train ${train.number}, stop ${station.index + 1} of ${stations.length}`}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="edit-station-form" className="btn btn-primary" disabled={busy}>
            {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Save changes
          </button>
        </>
      }
    >
      <form id="edit-station-form" onSubmit={submit} noValidate className="space-y-4 pb-2">
        {formError && (
          <div role="alert" className="rounded-xl border border-stop-100 bg-stop-50 px-3.5 py-2.5 text-sm font-medium text-stop-700">
            {formError}
          </div>
        )}
        <TextField ref={nameRef} label="Station name" value={name} onChange={setName} error={errors.name} maxLength={60} autoComplete="off" />
        <div className="grid grid-cols-2 gap-3">
          <TimeField
            ref={arrivalRef}
            label="Arrival"
            value={arrival}
            onChange={setArrival}
            error={errors.arrival}
            hint={prev ? `After ${prev.departure}` : undefined}
          />
          <TimeField
            ref={departureRef}
            label="Departure"
            value={departure}
            onChange={setDeparture}
            error={errors.departure}
            hint={next ? `Before ${next.arrival}` : undefined}
          />
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- details

const STATE_LABEL = { visited: 'Visited', current: 'Current location', upcoming: 'Upcoming' };

function Row({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-right font-semibold tabular-nums text-ink">{children}</dd>
    </div>
  );
}

// Loads the station from the API so the details are always current.
export function StationDetailsDialog({ train, station, stations, onClose }) {
  const [details, setDetails] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .getStation(train.number, station.index)
      .then((data) => !cancelled && setDetails(data.station))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [train.number, station.index]);

  const next = stations[station.index + 1];
  const prev = stations[station.index - 1];

  return (
    <Modal
      open
      onClose={onClose}
      title={station.name}
      description={`Train ${train.number}, ${train.name}`}
      size="sm"
      footer={
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      }
    >
      {error && <p role="alert" className="pb-3 text-sm font-medium text-stop-700">{error}</p>}
      {!details && !error && (
        <div className="space-y-3 pb-3" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-6" />
          ))}
        </div>
      )}
      {details && (
        <dl className="divide-y divide-line pb-2 text-[15px]">
          <Row label="Position">
            Stop {details.index + 1} of {stations.length}
          </Row>
          <Row label="Status">{STATE_LABEL[details.state]}</Row>
          <Row label="Arrival">{details.arrival}</Row>
          <Row label="Departure">{details.departure}</Row>
          <Row label="Time at station">{details.dwellMinutes > 0 ? describeDuration(details.dwellMinutes) : 'Passes through'}</Row>
          <Row label="From previous stop">
            {details.travelMinutesFromPrevious === null
              ? 'This is the origin'
              : `${describeDuration(details.travelMinutesFromPrevious)} from ${prev?.name ?? 'previous stop'}`}
          </Row>
          <Row label="Next stop">{next ? next.name : 'None, this is the final station'}</Row>
        </dl>
      )}
    </Modal>
  );
}
