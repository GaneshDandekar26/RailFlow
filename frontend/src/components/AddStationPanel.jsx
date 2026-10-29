import { useRef, useState } from 'react';
import { LoaderCircle, Plus } from 'lucide-react';
import { TextField, TimeField } from './Fields.jsx';
import StatusBadge from './StatusBadge.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../lib/api.js';
import { validateStation } from '../lib/validators.js';

// Form for appending stations one after another. After each save the name
// clears, arrival is pre-filled with the departure just entered, and focus
// returns to the name so a whole route can be typed in quickly.
export default function AddStationPanel({ train, stations, knownStations = [], onAdded }) {
  const toast = useToast();
  const last = stations.length ? stations[stations.length - 1] : null;

  const [name, setName] = useState('');
  const [arrival, setArrival] = useState(last?.departure ?? '');
  const [departure, setDeparture] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const nameRef = useRef(null);
  const arrivalRef = useRef(null);
  const departureRef = useRef(null);
  const datalistId = 'known-stations';

  const submit = async (event) => {
    event.preventDefault();
    setFormError('');
    const found = validateStation(
      { name, arrival, departure },
      {
        prev: last ? { name: last.name, departure: last.departure } : null,
        others: stations.map((s) => s.name),
      },
    );
    setErrors(found);
    if (found.name) return nameRef.current?.focus();
    if (found.arrival) return arrivalRef.current?.focus();
    if (found.departure) return departureRef.current?.focus();

    setBusy(true);
    try {
      const route = await api.addStation(train.number, {
        name: name.trim(),
        arrival,
        departure,
      });
      toast.success(`Added ${name.trim()} to train ${train.number}.`);
      setName('');
      setArrival(departure);
      setDeparture('');
      setErrors({});
      onAdded(route);
      nameRef.current?.focus();
    } catch (err) {
      if (['name', 'arrival', 'departure'].includes(err.field)) setErrors({ [err.field]: err.message });
      else setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="add-station" className="card p-5" aria-labelledby="add-station-title">
      <h2 id="add-station-title" className="text-lg font-semibold">
        Add station
      </h2>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-canvas px-3 py-2.5 text-sm">
        <span className="text-ink-500">Adding to</span>
        <span className="font-display text-lg font-semibold tabular-nums">{train.number}</span>
        <span className="min-w-0 truncate font-medium">{train.name}</span>
        <StatusBadge status={train.status} className="ml-auto" />
      </div>

      <form onSubmit={submit} noValidate className="mt-4 space-y-4">
        {formError && (
          <div role="alert" className="rounded-xl border border-stop-100 bg-stop-50 px-3.5 py-2.5 text-sm font-medium text-stop-700">
            {formError}
          </div>
        )}
        <TextField
          ref={nameRef}
          label="Station name"
          value={name}
          onChange={setName}
          error={errors.name}
          list={datalistId}
          autoComplete="off"
          placeholder={last ? 'Next station' : 'Origin station'}
          maxLength={60}
        />
        <datalist id={datalistId}>
          {knownStations
            .filter((n) => !stations.some((s) => s.name.toLowerCase() === n.toLowerCase()))
            .map((n) => (
              <option key={n} value={n} />
            ))}
        </datalist>
        <div className="grid grid-cols-2 gap-3">
          <TimeField ref={arrivalRef} label="Arrival" value={arrival} onChange={setArrival} error={errors.arrival} />
          <TimeField
            ref={departureRef}
            label="Departure"
            value={departure}
            onChange={setDeparture}
            error={errors.departure}
          />
        </div>
        <p className="text-[13px] text-ink-500">
          24-hour times, for example 08:15 or 18:45. {last ? `Arrival can't be earlier than ${last.departure}, when the train leaves ${last.name}. ` : ''}
          New stations are added after the last stop. Journeys can't cross midnight.
        </p>
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="h-4 w-4" aria-hidden="true" />
          )}
          Add station
        </button>
      </form>
    </section>
  );
}
