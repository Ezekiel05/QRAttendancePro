import React, { useEffect, useMemo, useState } from 'react';
import { useData } from '../context/DataContext.jsx';
import { dateKey, fmtDateTime, toLocalInputValue } from '../utils/time.js';
import { recordDay } from '../utils/attendance.js';
import { downloadCSV } from '../utils/csv.js';
import Modal from '../components/Modal.jsx';
import {
  btnPrimary,
  btnSecondary,
  cardCls,
  EventPill,
  inputCls,
  linkBtn,
  muted,
  PageHeader,
  Pagination,
  Pill,
  rowCls,
  theadCls
} from '../components/ui.jsx';

const PAGE_SIZE = 25;

function RecordForm({ record, employees, onSave, onClose }) {
  // If the record's employee was deleted, keep them selectable so the edit still works.
  const options = useMemo(() => {
    if (record && !employees.some((e) => e.id === record.employeeId)) {
      return [{ id: record.employeeId, name: `${record.employeeName} (removed)` }, ...employees];
    }
    return employees.filter((e) => e.active || (record && e.id === record.employeeId));
  }, [employees, record]);

  const [employeeId, setEmployeeId] = useState(record?.employeeId || options[0]?.id || '');
  const [type, setType] = useState(record?.type || 'in');
  const [when, setWhen] = useState(toLocalInputValue(record?.timestamp || new Date()));
  const [note, setNote] = useState(record?.note || '');

  function submit(e) {
    e.preventDefault();
    if (!employeeId || !when) return;
    onSave({ employeeId, type, timestamp: new Date(when).toISOString(), note: note.trim() });
  }

  return (
    <Modal title={record ? 'Edit record' : 'Add manual entry'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Employee</label>
          <select
            className={inputCls}
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            required
          >
            {options.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Event</label>
            <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="in">Sign in</option>
              <option value="out">Sign out</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Date & time</label>
            <input
              type="datetime-local"
              className={inputCls}
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              required
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Note (optional)</label>
          <input
            className={inputCls}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Forgot badge, corrected by admin"
          />
        </div>
        <div className="flex gap-2 pt-2">
          <button type="submit" className={`${btnPrimary} flex-1`}>
            {record ? 'Save changes' : 'Add entry'}
          </button>
          <button type="button" onClick={onClose} className={`${btnSecondary} flex-1`}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function Records() {
  const { records, employees, employeeById, addManualRecord, updateRecord, deleteRecord } =
    useData();
  const [emp, setEmp] = useState('all');
  const [type, setType] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); // null | 'new' | record

  useEffect(() => setPage(1), [emp, type, from, to]);

  const filtered = useMemo(
    () =>
      records
        .filter((r) => {
          if (emp !== 'all' && r.employeeId !== emp) return false;
          if (type !== 'all' && r.type !== type) return false;
          const k = recordDay(r);
          if (from && k < from) return false;
          if (to && k > to) return false;
          return true;
        })
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [records, emp, type, from, to]
  );

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const filtersOn = emp !== 'all' || type !== 'all' || from || to;

  const nameOf = (r) => employeeById.get(r.employeeId)?.name || r.employeeName;

  function exportCSV() {
    downloadCSV(`attendance-log-${dateKey(new Date())}.csv`, [
      ['Employee Code', 'Name', 'Department', 'Event', 'Status', 'Date', 'Time', 'Source', 'Note'],
      ...filtered.map((r) => [
        r.employeeCode,
        nameOf(r),
        r.department,
        r.type === 'in' ? 'Sign in' : 'Sign out',
        r.status,
        recordDay(r),
        new Date(r.timestamp).toLocaleTimeString(),
        r.source,
        r.note
      ])
    ]);
  }

  function handleSave(data) {
    if (editing === 'new') addManualRecord(data);
    else updateRecord(editing.id, data);
    setEditing(null);
  }

  function handleDelete(r) {
    if (window.confirm(`Delete this ${r.type === 'in' ? 'sign-in' : 'sign-out'} for ${nameOf(r)}?`)) {
      deleteRecord(r.id);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader title="Attendance log" subtitle={`${filtered.length} record(s)`}>
        <button className={btnSecondary} onClick={exportCSV} disabled={!filtered.length}>
          Export CSV
        </button>
        <button
          className={btnPrimary}
          onClick={() => setEditing('new')}
          disabled={!employees.some((e) => e.active)}
        >
          + Manual entry
        </button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select className={`${inputCls} sm:w-auto`} value={emp} onChange={(e) => setEmp(e.target.value)}>
          <option value="all">All employees</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <select className={`${inputCls} sm:w-auto`} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">In & out</option>
          <option value="in">Sign in only</option>
          <option value="out">Sign out only</option>
        </select>
        <input type="date" className={`${inputCls} sm:w-auto`} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
        <span className={muted}>to</span>
        <input type="date" className={`${inputCls} sm:w-auto`} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
        {filtersOn && (
          <button
            className={linkBtn}
            onClick={() => {
              setEmp('all');
              setType('all');
              setFrom('');
              setTo('');
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="space-y-3 md:hidden">
        {visible.length === 0 && (
          <div className={`${cardCls} px-4 py-8 text-center ${muted}`}>No records match.</div>
        )}
        {visible.map((r) => (
          <div key={r.id} className={`${cardCls} p-4`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-semibold">{nameOf(r)}</div>
                <div className={`text-xs ${muted}`}>
                  {r.department} · {fmtDateTime(r.timestamp)}
                </div>
              </div>
              <EventPill type={r.type} status={r.status} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <Pill tone={r.source === 'qr' || r.source === 'face' ? 'indigo' : 'slate'}>
                {r.source === 'qr'
                  ? 'QR'
                  : r.source === 'face'
                  ? 'Face'
                  : r.source === 'manual'
                  ? 'Manual'
                  : r.source}
              </Pill>
              {r.edited && <Pill tone="amber">Edited</Pill>}
                    {r.unscheduled && <Pill tone="amber">Unscheduled</Pill>}
              {r.note && <span className={`text-xs ${muted}`}>{r.note}</span>}
            </div>
            <div className="mt-3 flex gap-2">
              <button className={btnSecondary} onClick={() => setEditing(r)}>
                Edit
              </button>
              <button
                className="rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300"
                onClick={() => handleDelete(r)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className={`${cardCls} hidden overflow-x-auto md:block`}>
        <table className="w-full text-sm">
          <thead className={theadCls}>
            <tr>
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Event</th>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className={`px-4 py-8 text-center ${muted}`}>
                  No records match.
                </td>
              </tr>
            )}
            {visible.map((r) => (
              <tr key={r.id} className={rowCls}>
                <td className="px-4 py-3">
                  <div className="font-medium">{nameOf(r)}</div>
                  <div className={`text-xs ${muted}`}>{r.department}</div>
                </td>
                <td className="px-4 py-3">
                  <EventPill type={r.type} status={r.status} />
                </td>
                <td className={`whitespace-nowrap px-4 py-3 ${muted}`}>{fmtDateTime(r.timestamp)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1">
                    <Pill tone={r.source === 'qr' || r.source === 'face' ? 'indigo' : 'slate'}>
                      {r.source === 'qr' ? 'QR' : r.source === 'face' ? 'Face' : r.source === 'manual' ? 'Manual' : r.source}
                    </Pill>
                    {r.edited && <Pill tone="amber">Edited</Pill>}
                    {r.unscheduled && <Pill tone="amber">Unscheduled</Pill>}
                    {r.note && <span className={`text-xs ${muted}`}>{r.note}</span>}
                  </div>
                </td>
                <td className="space-x-3 whitespace-nowrap px-4 py-3 text-right">
                  <button className={linkBtn} onClick={() => setEditing(r)}>
                    Edit
                  </button>
                  <button
                    className="font-medium text-red-500 hover:text-red-700"
                    onClick={() => handleDelete(r)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={current} pages={pages} onChange={setPage} />

      {editing && (
        <RecordForm
          record={editing === 'new' ? null : editing}
          employees={employees}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
