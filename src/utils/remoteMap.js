// Converts between the app's objects (camelCase) and database rows (snake_case).
// Timestamps are normalised to ISO strings ending in "Z" because the app compares
// them as plain strings (Postgres returns "+00:00").

import { normalizeSettings } from './storage.js';

const iso = (v) => (v ? new Date(v).toISOString() : null);

export const employeeFromDb = (r) => ({
  id: r.id,
  employeeCode: r.employee_code,
  name: r.name,
  department: r.department || 'General',
  position: r.job_title || '',
  email: r.email || '',
  badgeToken: r.badge_token,
  shiftId: r.shift_id || undefined,
  active: r.active !== false,
  faceDescriptors: r.face_descriptors?.length ? r.face_descriptors : undefined,
  faceEnrolledAt: iso(r.face_enrolled_at),
  faceConsentAt: iso(r.face_consent_at),
  createdAt: iso(r.created_at)
});

export const employeeToDb = (e) => ({
  id: e.id,
  employee_code: e.employeeCode,
  name: e.name,
  department: e.department || 'General',
  job_title: e.position || '',
  email: e.email || '',
  badge_token: e.badgeToken,
  shift_id: e.shiftId || null,
  active: e.active !== false,
  face_descriptors: e.faceDescriptors?.length ? e.faceDescriptors : null,
  face_enrolled_at: e.faceEnrolledAt || null,
  face_consent_at: e.faceConsentAt || null,
  created_at: e.createdAt || new Date().toISOString()
});

export const recordFromDb = (r) => ({
  id: r.id,
  employeeId: r.employee_id,
  employeeName: r.employee_name,
  employeeCode: r.employee_code,
  department: r.department,
  type: r.type,
  status: r.status,
  shiftId: r.shift_id || undefined,
  workDate: r.work_date || undefined,
  ...(r.unscheduled ? { unscheduled: true } : {}),
  ...(r.edited ? { edited: true } : {}),
  timestamp: iso(r.ts),
  source: r.source,
  note: r.note || ''
});

export const recordToDb = (r) => ({
  id: r.id,
  employee_id: r.employeeId,
  employee_name: r.employeeName ?? null,
  employee_code: r.employeeCode ?? null,
  department: r.department ?? null,
  type: r.type,
  status: r.status ?? null,
  shift_id: r.shiftId || null,
  work_date: r.workDate || null,
  unscheduled: Boolean(r.unscheduled),
  edited: Boolean(r.edited),
  ts: r.timestamp,
  source: r.source || 'qr',
  note: r.note || ''
});

export const pendingFromDb = (r) => ({
  id: r.id,
  name: r.name,
  department: r.department || 'General',
  position: r.job_title || '',
  email: r.email || '',
  badgeToken: r.badge_token,
  photo: r.photo || '',
  faceDescriptors: r.face_descriptors || [],
  consentAt: iso(r.consent_at),
  submittedAt: iso(r.submitted_at)
});

// Turns the kiosk_load() reply into the app's shapes. Scans still waiting in this
// device's outbox are included so they count straight away.
export function snapshotFromKioskLoad(data, outbox = []) {
  const d = data || {};
  const records = (d.records || []).map(recordFromDb);
  const known = new Set(records.map((r) => r.id));
  for (const r of outbox) if (!known.has(r.id)) records.push(r);

  const schedule = {};
  for (const e of d.schedule || []) {
    if (!schedule[e.employee_id]) schedule[e.employee_id] = {};
    schedule[e.employee_id][e.day] = e.value;
  }
  const patterns = {};
  for (const p of d.patterns || []) patterns[p.employee_id] = p.pattern;

  return {
    employees: (d.employees || []).map(employeeFromDb),
    records,
    settings: normalizeSettings(d.settings || {}),
    pending: [],
    schedule,
    patterns
  };
}
