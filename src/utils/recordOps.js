// Pure helpers for creating and editing attendance records. They take every piece
// of state they need as arguments (no storage, no network), so the same rules run
// for the shared database and are easy to test.
import {
  BADGE_PREFIX,
  classify,
  lastRecordFor,
  nextType,
  resolveShift,
  scheduledBranch,
  shiftFor,
  workDateOf
} from './attendance.js';
import { randomHex, uid } from './crypto.js';

export function nextEmployeeCode(employees) {
  let max = 0;
  for (const e of employees) {
    const m = /^EMP-(\d+)$/.exec(e.employeeCode);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `EMP-${String(max + 1).padStart(4, '0')}`;
}

export function makeEmployee(data, employees, settings) {
  return {
    id: uid(),
    employeeCode: nextEmployeeCode(employees),
    name: data.name,
    department: data.department || 'General',
    position: data.position || '',
    email: data.email || '',
    shiftId: data.shiftId || shiftFor(null, settings).id,
    ...(data.branchId ? { branchId: data.branchId } : {}),
    badgeToken: randomHex(12),
    active: true,
    createdAt: new Date().toISOString()
  };
}

// The kiosk scan rules. Returns { result, record? }; `record` is only set when a
// sign-in/out should be saved. For an unknown QR badge the result carries `token`
// so the caller can check whether it belongs to a signup that is still pending.
export function computeScan({
  raw,
  source = 'qr',
  employees,
  records,
  settings,
  schedule,
  patterns,
  now = new Date(),
  isPendingToken,
  branchId
}) {
  const text = String(raw || '').trim();

  let employee;
  if (source === 'face') {
    employee = employees.find((e) => e.id === text);
  } else if (source === 'qr') {
    employee = text.startsWith(BADGE_PREFIX)
      ? employees.find((e) => e.badgeToken === text.slice(BADGE_PREFIX.length))
      : undefined;
  } else {
    employee = employees.find((e) => e.employeeCode.toLowerCase() === text.toLowerCase());
  }

  if (!employee) {
    if (source === 'qr' && text.startsWith(BADGE_PREFIX)) {
      const token = text.slice(BADGE_PREFIX.length);
      if (isPendingToken && isPendingToken(token)) return { result: { ok: false, reason: 'pending' } };
      return { result: { ok: false, reason: 'unknown', token } };
    }
    return { result: { ok: false, reason: 'unknown' } };
  }
  if (!employee.active) return { result: { ok: false, reason: 'inactive', employee } };

  const last = lastRecordFor(records, employee.id);
  if (last) {
    const elapsed = (now - new Date(last.timestamp)) / 1000;
    if (elapsed < settings.minScanIntervalSec) {
      return {
        result: {
          ok: false,
          reason: 'too-soon',
          employee,
          wait: Math.ceil(settings.minScanIntervalSec - elapsed)
        }
      };
    }
  }

  const lastShift = last?.shiftId ? (settings.shifts || []).find((s) => s.id === last.shiftId) : null;
  const type = nextType(records, employee.id, now, lastShift || shiftFor(employee, settings));
  const { shift, scheduled, workDate } = resolveShift({
    employee,
    type,
    when: now,
    recs: records,
    settings,
    schedule,
    patterns
  });

  const record = {
    id: uid(),
    employeeId: employee.id,
    employeeName: employee.name,
    employeeCode: employee.employeeCode,
    department: employee.department,
    type,
    status: classify(type, now, shift),
    shiftId: shift.id,
    workDate,
    ...(type === 'in' && !scheduled ? { unscheduled: true } : {}),
    ...(branchId ? { branchId } : {}),
    timestamp: now.toISOString(),
    source,
    note: ''
  };
  // Where this person was scheduled to work that day (lets the kiosk say "Scheduled at ...").
  const expectedBranchId = scheduledBranch(employee, workDate, schedule, patterns) || undefined;
  return { result: { ok: true, employee, record, expectedBranchId }, record };
}

export function makeManualRecord({ employee, type, timestamp, note, branchId, records, settings, schedule, patterns }) {
  const when = new Date(timestamp);
  const { shift, scheduled, workDate } = resolveShift({
    employee,
    type,
    when,
    recs: records,
    settings,
    schedule,
    patterns
  });
  return {
    id: uid(),
    employeeId: employee.id,
    employeeName: employee.name,
    employeeCode: employee.employeeCode,
    department: employee.department,
    type,
    status: classify(type, when, shift),
    shiftId: shift.id,
    workDate,
    ...(type === 'in' && !scheduled ? { unscheduled: true } : {}),
    ...(branchId ? { branchId } : {}),
    timestamp,
    source: 'manual',
    note: note || ''
  };
}

// Applies an admin edit to a record and recomputes its shift, work date and status.
export function rebuildRecord({ record, patch, employees, records, settings, schedule, patterns }) {
  const merged = { ...record, ...patch };
  const emp = employees.find((e) => e.id === merged.employeeId);
  if (emp) {
    merged.employeeName = emp.name;
    merged.employeeCode = emp.employeeCode;
    merged.department = emp.department;
  }
  const when = new Date(merged.timestamp);
  let resolved;
  if (emp) {
    resolved = resolveShift({
      employee: emp,
      type: merged.type,
      when,
      recs: records,
      settings,
      schedule,
      patterns,
      ignoreId: record.id
    });
  } else {
    const stored = (settings.shifts || []).find((s) => s.id === merged.shiftId) || shiftFor(null, settings);
    resolved = { shift: stored, scheduled: true, workDate: workDateOf(when, stored) };
  }
  merged.shiftId = resolved.shift.id;
  merged.workDate = resolved.workDate;
  merged.status = classify(merged.type, when, resolved.shift);
  if (merged.type === 'in' && !resolved.scheduled) merged.unscheduled = true;
  else delete merged.unscheduled;
  merged.edited = true;
  return merged;
}
