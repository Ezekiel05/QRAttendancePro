// Low-level localStorage helpers + shared constants.
// All persistence goes through here, so swapping in a real backend later
// means changing this file and the DataContext actions only.

export const KEYS = {
  employees: 'qrap_employees',
  records: 'qrap_records',
  settings: 'qrap_settings',
  auth: 'qrap_auth',
  lock: 'qrap_lock',
  pending: 'qrap_pending',
  schedule: 'qrap_schedule',
  patterns: 'qrap_patterns'
};

// Up to four shifts. A shift whose end is earlier than its start runs overnight.
export const DEFAULT_SHIFTS = [
  { id: 's1', name: 'Day', start: '09:00', end: '18:00', grace: 10, enabled: true },
  { id: 's2', name: 'Morning', start: '06:00', end: '14:00', grace: 10, enabled: true },
  { id: 's3', name: 'Evening', start: '14:00', end: '22:00', grace: 10, enabled: true },
  { id: 's4', name: 'Night', start: '22:00', end: '06:00', grace: 10, enabled: true }
];

export const DEFAULT_SETTINGS = {
  companyName: 'My Company',
  shifts: DEFAULT_SHIFTS,
  workDays: [1, 2, 3, 4, 5], // 0 = Sunday
  minScanIntervalSec: 60,
  soundEnabled: true,
  kioskManualEntry: false,
  sessionTimeoutMin: 15,
  faceEnabled: false,
  faceThreshold: 0.45, // max descriptor distance for a match (lower = stricter)
  faceMargin: 0.08, // best match must beat the runner-up by this much
  selfSignupEnabled: false,
  signupCode: ''
};

// Merges stored settings over the defaults. Settings saved before shifts existed
// (workStart / workEnd / graceMinutes) are carried over into the first shift.
export function normalizeSettings(stored = {}) {
  const merged = { ...DEFAULT_SETTINGS, ...stored };
  if (!Array.isArray(stored.shifts) || stored.shifts.length === 0) {
    merged.shifts = DEFAULT_SHIFTS.map((shift) =>
      shift.id === 's1' && stored.workStart
        ? {
            ...shift,
            start: stored.workStart,
            end: stored.workEnd || shift.end,
            grace: stored.graceMinutes ?? shift.grace
          }
        : { ...shift }
    );
  }
  return merged;
}

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
