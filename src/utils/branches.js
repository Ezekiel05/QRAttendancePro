// Branch helpers. Branches live in the settings (settings.branches) so they sync like every
// other setting: [{ id, name, address, active }].
import { randomHex } from './crypto.js';
import { recordDay, scheduledBranch } from './attendance.js';

export const activeBranches = (settings) => (settings.branches || []).filter((b) => b.active !== false);

export function branchName(settings, id) {
  if (!id) return '';
  const b = (settings.branches || []).find((x) => x.id === id);
  return b ? b.name : 'Removed branch';
}

export const makeBranch = (name, address = '') => ({
  id: randomHex(6),
  name: String(name).trim().slice(0, 60),
  address: String(address ?? '').trim().slice(0, 120),
  active: true
});

// Returns an error message, or '' when the name is fine.
export function validateBranchName(name, branches, ignoreId) {
  const n = String(name ?? '').trim();
  if (!n) return 'Enter a branch name.';
  if (branches.some((b) => b.id !== ignoreId && b.name.toLowerCase() === n.toLowerCase())) {
    return 'A branch with that name already exists.';
  }
  return '';
}

// How much of the data points at a branch (a branch in use can only be archived, not deleted).
export function branchUsage(id, employees, records) {
  return {
    employees: employees.filter((e) => e.branchId === id).length,
    records: records.filter((r) => r.branchId === id).length
  };
}

// Where an employee was meant to be on the day of a record: the branch scheduled for that day,
// otherwise their assigned branch.
export function expectedBranchId(record, employee, schedule, patterns) {
  if (!employee) return '';
  return scheduledBranch(employee, recordDay(record), schedule, patterns);
}

// Signed in at a different branch than the one they were scheduled at that day.
export function isOtherBranch(record, employee, schedule, patterns) {
  const expected = employee ? expectedBranchId(record, employee, schedule, patterns) : '';
  return Boolean(record?.branchId && expected && record.branchId !== expected);
}
