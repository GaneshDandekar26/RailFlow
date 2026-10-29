// Client-side validation. It mirrors the backend rules so people get instant,
// field-level feedback; the backend remains the final authority and its
// messages are shown too if it disagrees.

import { isValidTime, toMinutes } from './format.js';

export function validateTrain({ number, name }, { existingNumbers = [], currentNumber = null } = {}) {
  const errors = {};
  const num = (number ?? '').trim();
  const nm = (name ?? '').trim();

  if (!num) errors.number = 'Enter a train number.';
  else if (!/^\d{3,6}$/.test(num)) errors.number = 'Use 3 to 6 digits, for example 12127.';
  else if (num !== currentNumber && existingNumbers.includes(num)) {
    errors.number = `Train ${num} already exists. Train numbers must be unique.`;
  }

  if (!nm) errors.name = 'Enter a train name.';
  else if (nm.length < 2) errors.name = 'Use at least 2 characters.';
  else if (nm.length > 60) errors.name = 'Use 60 characters or fewer.';

  return errors;
}

/**
 * @param fields   { name, arrival, departure } as typed
 * @param context  { prev, next, others } where prev/next are neighbouring
 *                 stations ({name, departure, arrival} in "HH:MM") and
 *                 `others` is a list of the other station names on the route.
 */
export function validateStation(fields, { prev = null, next = null, others = [] } = {}) {
  const errors = {};
  const name = (fields.name ?? '').trim();
  const arrival = (fields.arrival ?? '').trim();
  const departure = (fields.departure ?? '').trim();

  if (!name) errors.name = 'Enter a station name.';
  else if (name.length > 60) errors.name = 'Use 60 characters or fewer.';
  else if (others.some((n) => n.toLowerCase() === name.toLowerCase())) {
    errors.name = `${name} is already on this route.`;
  }

  if (!arrival) errors.arrival = 'Enter an arrival time.';
  else if (!isValidTime(arrival)) errors.arrival = 'Use 24-hour HH:MM, from 00:00 to 23:59.';

  if (!departure) errors.departure = 'Enter a departure time.';
  else if (!isValidTime(departure)) errors.departure = 'Use 24-hour HH:MM, from 00:00 to 23:59.';

  const arr = toMinutes(arrival);
  const dep = toMinutes(departure);

  if (!errors.arrival && !errors.departure && dep < arr) {
    errors.departure = 'Departure cannot be earlier than arrival.';
  }
  if (!errors.arrival && prev && arr < toMinutes(prev.departure)) {
    errors.arrival = `Arrival can't be earlier than the departure from ${prev.name} (${prev.departure}). Journeys can't cross midnight.`;
  }
  if (!errors.departure && next && dep > toMinutes(next.arrival)) {
    errors.departure = `Departure can't be later than the arrival at ${next.name} (${next.arrival}).`;
  }
  return errors;
}
