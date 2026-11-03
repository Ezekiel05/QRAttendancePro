export const pad = (n) => String(n).padStart(2, '0');

// Local calendar date key, e.g. "2026-10-29"
export function dateKey(value) {
  const d = new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const todayKey = () => dateKey(new Date());

export function addDays(key, n) {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

// Inclusive list of date keys (capped at 366 days as a safety net).
export function rangeKeys(from, to) {
  const out = [];
  let k = from;
  while (k <= to && out.length < 366) {
    out.push(k);
    k = addDays(k, 1);
  }
  return out;
}

export const minutesOfDay = (d) => d.getHours() * 60 + d.getMinutes();

export function parseHM(str) {
  const [h, m] = String(str).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

export const fmtDate = (key) =>
  new Date(`${key}T00:00:00`).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

export function fmtDuration(mins) {
  if (!mins || mins < 0) return '0h 00m';
  const total = Math.round(mins);
  return `${Math.floor(total / 60)}h ${pad(total % 60)}m`;
}

// Value for <input type="datetime-local">
export function toLocalInputValue(value = new Date()) {
  const d = new Date(value);
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Monday of the week containing a date key.
export function mondayOfKey(key) {
  const d = new Date(`${key}T00:00:00`);
  return addDays(key, -((d.getDay() + 6) % 7));
}
