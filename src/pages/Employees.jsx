import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext.jsx';
import { isPresentNow, shiftFor } from '../utils/attendance.js';
import PendingSignups from '../components/PendingSignups.jsx';
import { todayKey } from '../utils/time.js';
import BadgeModal from '../components/BadgeModal.jsx';
import FaceEnrollModal from '../components/FaceEnrollModal.jsx';
import Modal from '../components/Modal.jsx';
import {
  btnPrimary,
  btnSecondary,
  cardCls,
  inputCls,
  linkBtn,
  muted,
  PageHeader,
  Pill,
  rowCls,
  theadCls
} from '../components/ui.jsx';

function EmployeeForm({ initial, shifts, onSave, onClose }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    position: initial?.position || '',
    department: initial?.department || '',
    email: initial?.email || '',
    shiftId: initial?.shiftId || shifts.find((s) => s.enabled)?.id || shifts[0].id
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave({
      name: form.name.trim(),
      position: form.position.trim(),
      department: form.department.trim() || 'General',
      email: form.email.trim(),
      shiftId: form.shiftId
    });
  }

  return (
    <Modal title={initial ? 'Edit employee' : 'Add employee'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Full name *</label>
          <input className={inputCls} value={form.name} onChange={set('name')} autoFocus required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Position</label>
            <input className={inputCls} value={form.position} onChange={set('position')} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Department</label>
            <input className={inputCls} value={form.department} onChange={set('department')} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Default shift</label>
          <select className={inputCls} value={form.shiftId} onChange={set('shiftId')}>
            {shifts
              .filter((s) => s.enabled || s.id === form.shiftId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.start}–{s.end})
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Email</label>
          <input type="email" className={inputCls} value={form.email} onChange={set('email')} />
        </div>
        <div className="flex gap-2 pt-2">
          <button type="submit" className={`${btnPrimary} flex-1`}>
            {initial ? 'Save changes' : 'Add employee'}
          </button>
          <button type="button" onClick={onClose} className={`${btnSecondary} flex-1`}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function Employees() {
  const {
    employees,
    records,
    settings,
    addEmployee,
    updateEmployee,
    removeEmployee,
    regenerateBadge,
    pending,
    approveSignup,
    rejectSignup
  } = useData();
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [shiftFilter, setShiftFilter] = useState('all');
  const [editing, setEditing] = useState(null); // null | 'new' | employee
  const [badgeId, setBadgeId] = useState(null);
  const [faceId, setFaceId] = useState(null);
  const today = todayKey();

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees
      .filter((e) => showArchived || e.active)
      .filter((e) => shiftFilter === 'all' || shiftFor(e, settings).id === shiftFilter)
      .filter(
        (e) =>
          !q ||
          [e.name, e.employeeCode, e.department, e.position].some((v) =>
            String(v || '').toLowerCase().includes(q)
          )
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees, query, showArchived, shiftFilter, settings]);

  const badgeEmployee = employees.find((e) => e.id === badgeId);
  const faceEmployee = employees.find((e) => e.id === faceId);

  function handleSave(data) {
    if (editing === 'new') addEmployee(data);
    else updateEmployee(editing.id, data);
    setEditing(null);
  }

  function handleDelete(e) {
    if (
      window.confirm(
        `Delete ${e.name}? Their past attendance records are kept in the log, but their badge stops working. Consider archiving instead.`
      )
    ) {
      removeEmployee(e.id);
    }
  }

  function handleApprove(reg, look, shiftId) {
    if (
      look &&
      !window.confirm(`${reg.name}'s face looks like ${look}, who is already enrolled. Approve anyway?`)
    ) {
      return;
    }
    approveSignup(reg.id, shiftId);
  }

  function handleReject(reg) {
    if (window.confirm(`Reject ${reg.name}'s signup? The QR badge they saved will not work.`)) {
      rejectSignup(reg.id);
    }
  }

  function handleRegenerate(e) {
    if (window.confirm(`Issue a new QR badge for ${e.name}? The old badge will stop working.`)) {
      regenerateBadge(e.id);
      setBadgeId(e.id);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader title="Employees" subtitle="Add people and issue their scannable QR badges.">
        <Link to="/admin/badges" className={btnSecondary}>
          Print badges
        </Link>
        <button className={btnPrimary} onClick={() => setEditing('new')}>
          + Add employee
        </button>
      </PageHeader>

      <PendingSignups
        pending={pending}
        shifts={settings.shifts}
        employees={employees}
        threshold={Number(settings.faceThreshold) || 0.45}
        onApprove={handleApprove}
        onReject={handleReject}
      />

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <input
          className={`${inputCls} max-w-xs`}
          placeholder="Search name, code, department…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className={`${inputCls} sm:w-auto`}
          value={shiftFilter}
          onChange={(e) => setShiftFilter(e.target.value)}
          aria-label="Filter by shift"
        >
          <option value="all">All shifts</option>
          {settings.shifts
            .filter((s) => s.enabled)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
      </div>

      <div className="space-y-3 lg:hidden">
        {list.length === 0 && (
          <div className={`${cardCls} px-4 py-8 text-center ${muted}`}>
            {employees.length === 0
              ? 'No employees yet. Add your first one above.'
              : 'No employees match your search.'}
          </div>
        )}
        {list.map((e) => {
          const shift = shiftFor(e, settings);
          return (
            <div key={e.id} className={`${cardCls} p-4`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{e.name}</div>
                  <div className={`truncate text-xs ${muted}`}>
                    {[e.position, e.department].filter(Boolean).join(' · ')}
                  </div>
                  <div className={`font-mono text-xs ${muted}`}>{e.employeeCode}</div>
                </div>
                {!e.active ? (
                  <Pill tone="slate">Archived</Pill>
                ) : isPresentNow(records, e.id, new Date(), shift) ? (
                  <Pill tone="green">Signed in</Pill>
                ) : (
                  <Pill tone="slate">Signed out</Pill>
                )}
              </div>
              <div className={`mt-2 text-xs ${muted}`}>
                {shift.name} · {shift.start}–{shift.end}
                {e.faceDescriptors?.length > 0 && ' · Face enrolled'}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {settings.faceEnabled && (
                  <button className={btnSecondary} onClick={() => setFaceId(e.id)}>
                    Face
                  </button>
                )}
                <button className={btnSecondary} onClick={() => setBadgeId(e.id)}>
                  Badge
                </button>
                <button className={btnSecondary} onClick={() => handleRegenerate(e)}>
                  Reissue
                </button>
                <button className={btnSecondary} onClick={() => setEditing(e)}>
                  Edit
                </button>
                <button
                  className={btnSecondary}
                  onClick={() => updateEmployee(e.id, { active: !e.active })}
                >
                  {e.active ? 'Archive' : 'Restore'}
                </button>
                <button
                  className="rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300"
                  onClick={() => handleDelete(e)}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className={`${cardCls} hidden overflow-x-auto lg:block`}>
        <table className="w-full text-sm">
          <thead className={theadCls}>
            <tr>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Department</th>
              <th className="px-4 py-3 font-medium">Default shift</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={6} className={`px-4 py-8 text-center ${muted}`}>
                  {employees.length === 0
                    ? 'No employees yet. Add your first one above.'
                    : 'No employees match your search.'}
                </td>
              </tr>
            )}
            {list.map((e) => (
              <tr key={e.id} className={rowCls}>
                <td className={`px-4 py-3 font-mono text-xs ${muted}`}>{e.employeeCode}</td>
                <td className="px-4 py-3">
                  <div className="font-medium">{e.name}</div>
                  {e.position && <div className={`text-xs ${muted}`}>{e.position}</div>}
                  {e.faceDescriptors?.length > 0 && (
                    <div className="mt-1">
                      <Pill tone="indigo">Face enrolled</Pill>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">{e.department}</td>
                <td className="px-4 py-3">
                  <div>{shiftFor(e, settings).name}</div>
                  <div className={`text-xs ${muted}`}>
                    {shiftFor(e, settings).start}–{shiftFor(e, settings).end}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {!e.active ? (
                    <Pill tone="slate">Archived</Pill>
                  ) : isPresentNow(records, e.id, new Date(), shiftFor(e, settings)) ? (
                    <Pill tone="green">Signed in</Pill>
                  ) : (
                    <Pill tone="slate">Signed out</Pill>
                  )}
                </td>
                <td className="space-x-3 whitespace-nowrap px-4 py-3 text-right">
                  {settings.faceEnabled && (
                    <button className={linkBtn} onClick={() => setFaceId(e.id)}>
                      Face
                    </button>
                  )}
                  <button className={linkBtn} onClick={() => setBadgeId(e.id)}>
                    Badge
                  </button>
                  <button className={linkBtn} onClick={() => handleRegenerate(e)}>
                    Reissue
                  </button>
                  <button className={linkBtn} onClick={() => setEditing(e)}>
                    Edit
                  </button>
                  <button
                    className={linkBtn}
                    onClick={() => updateEmployee(e.id, { active: !e.active })}
                  >
                    {e.active ? 'Archive' : 'Restore'}
                  </button>
                  <button
                    className="font-medium text-red-500 hover:text-red-700"
                    onClick={() => handleDelete(e)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <EmployeeForm
          initial={editing === 'new' ? null : editing}
          shifts={settings.shifts}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
      {faceEmployee && (
        <FaceEnrollModal
          employee={faceEmployee}
          employees={employees}
          matchThreshold={Number(settings.faceThreshold) || 0.45}
          onSave={(patch) => {
            updateEmployee(faceEmployee.id, patch);
            setFaceId(null);
          }}
          onClose={() => setFaceId(null)}
        />
      )}
      {badgeEmployee && (
        <BadgeModal
          employee={badgeEmployee}
          company={settings.companyName}
          onClose={() => setBadgeId(null)}
        />
      )}
    </div>
  );
}
