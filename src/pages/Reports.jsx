import React, { useMemo, useState } from 'react';
import { useData } from '../context/DataContext.jsx';
import { buildReport, employeeTotals } from '../utils/attendance.js';
import { addDays, fmtDate, fmtDuration, fmtTime, pad, todayKey } from '../utils/time.js';
import { downloadCSV } from '../utils/csv.js';
import {
  btnSecondary,
  cardCls,
  inputCls,
  muted,
  PageHeader,
  Pill,
  rowCls,
  theadCls
} from '../components/ui.jsx';

function presetRange(name) {
  const today = todayKey();
  const d = new Date();
  switch (name) {
    case 'week':
      return [addDays(today, -((d.getDay() + 6) % 7)), today]; // Monday → today
    case 'month':
      return [`${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`, today];
    case '30':
      return [addDays(today, -29), today];
    default:
      return [today, today];
  }
}

const PRESETS = [
  ['today', 'Today'],
  ['week', 'This week'],
  ['month', 'This month'],
  ['30', 'Last 30 days']
];

export default function Reports() {
  const { records, employees, settings, schedule, patterns } = useData();
  const [[from, to], setRange] = useState(() => presetRange('week'));
  const [view, setView] = useState('summary'); // 'summary' | 'daily'
  const today = todayKey();

  const rows = useMemo(
    () => buildReport(records, employees, from, to),
    [records, employees, from, to]
  );
  const totals = useMemo(
    () => employeeTotals(rows, employees, from, to, settings, today, schedule, patterns),
    [rows, employees, from, to, settings, today, schedule, patterns]
  );

  const invalidRange = from > to;

  function exportCSV() {
    if (view === 'summary') {
      downloadCSV(`attendance-summary-${from}_to_${to}.csv`, [
        ['Employee Code', 'Name', 'Department', 'Days Present', 'Hours Worked', 'Late', 'Early Out', 'Absent', 'Missing Sign-in/out'],
        ...totals.map((t) => [
          t.code,
          t.name,
          t.department,
          t.days,
          (t.minutes / 60).toFixed(2),
          t.late,
          t.earlyOut,
          t.absent,
          t.missing
        ])
      ]);
    } else {
      downloadCSV(`attendance-daily-${from}_to_${to}.csv`, [
        ['Date', 'Employee Code', 'Name', 'Department', 'First In', 'Last Out', 'Hours Worked', 'Late', 'Early Out', 'Missing Sign-out'],
        ...rows.map((r) => [
          r.date,
          r.code,
          r.name,
          r.department,
          r.firstIn ? fmtTime(r.firstIn.timestamp) : '',
          r.lastOut ? fmtTime(r.lastOut.timestamp) : '',
          (r.minutes / 60).toFixed(2),
          r.late ? 'Yes' : '',
          r.earlyOut ? 'Yes' : '',
          r.missingOut || r.missingIn ? 'Yes' : ''
        ])
      ]);
    }
  }

  const tabCls = (active) =>
    `rounded-lg px-4 py-2 text-sm font-medium ${
      active
        ? 'bg-indigo-600 text-white'
        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200'
    }`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader title="Reports" subtitle="Hours worked, lateness and absences.">
        <button className={btnSecondary} onClick={exportCSV} disabled={invalidRange}>
          Export CSV
        </button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {PRESETS.map(([key, label]) => (
          <button key={key} className={btnSecondary} onClick={() => setRange(presetRange(key))}>
            {label}
          </button>
        ))}
        <input
          type="date"
          className={`${inputCls} sm:w-auto`}
          value={from}
          onChange={(e) => setRange([e.target.value, to])}
          aria-label="From date"
        />
        <span className={muted}>to</span>
        <input
          type="date"
          className={`${inputCls} sm:w-auto`}
          value={to}
          onChange={(e) => setRange([from, e.target.value])}
          aria-label="To date"
        />
      </div>
      {invalidRange && (
        <p className="mb-4 text-sm text-red-600">The start date must be on or before the end date.</p>
      )}

      <div className="mb-4 flex gap-2">
        <button className={tabCls(view === 'summary')} onClick={() => setView('summary')}>
          Summary by employee
        </button>
        <button className={tabCls(view === 'daily')} onClick={() => setView('daily')}>
          Daily detail
        </button>
      </div>

      <div className="space-y-3 md:hidden">
        {view === 'summary' ? (
          <>
            {totals.length === 0 && (
              <div className={`${cardCls} px-4 py-8 text-center ${muted}`}>
                No employees to report on.
              </div>
            )}
            {totals.map((t) => (
              <div key={t.employeeId} className={`${cardCls} p-4`}>
                <div className="font-semibold">{t.name}</div>
                <div className={`mb-3 text-xs ${muted}`}>{t.department}</div>
                <dl className="grid grid-cols-3 gap-3 text-sm">
                  {[
                    ['Days', t.days],
                    ['Hours', fmtDuration(t.minutes)],
                    ['Late', t.late],
                    ['Early out', t.earlyOut],
                    ['Absent', t.absent],
                    ['Missing', t.missing]
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className={`text-xs ${muted}`}>{label}</dt>
                      <dd className="font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </>
        ) : (
          <>
            {rows.length === 0 && (
              <div className={`${cardCls} px-4 py-8 text-center ${muted}`}>
                No attendance in this range.
              </div>
            )}
            {rows.map((r) => (
              <div key={`${r.employeeId}-${r.date}`} className={`${cardCls} p-4`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold">{r.name}</div>
                  <div className={`text-right text-xs ${muted}`}>{fmtDate(r.date)}</div>
                </div>
                <div className="mt-2 text-sm">
                  {r.firstIn ? fmtTime(r.firstIn.timestamp) : '—'} →{' '}
                  {r.lastOut ? fmtTime(r.lastOut.timestamp) : '—'} · {fmtDuration(r.minutes)}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.late && <Pill tone="amber">Late</Pill>}
                  {r.earlyOut && <Pill tone="amber">Early out</Pill>}
                  {r.missingOut && <Pill tone="red">No sign-out</Pill>}
                  {r.missingIn && <Pill tone="red">No sign-in</Pill>}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <div className={`${cardCls} hidden overflow-x-auto md:block`}>
        {view === 'summary' ? (
          <table className="w-full text-sm">
            <thead className={theadCls}>
              <tr>
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">Days present</th>
                <th className="px-4 py-3 font-medium">Hours worked</th>
                <th className="px-4 py-3 font-medium">Late</th>
                <th className="px-4 py-3 font-medium">Early out</th>
                <th className="px-4 py-3 font-medium">Absent</th>
                <th className="px-4 py-3 font-medium">Missing</th>
              </tr>
            </thead>
            <tbody>
              {totals.length === 0 && (
                <tr>
                  <td colSpan={7} className={`px-4 py-8 text-center ${muted}`}>
                    No employees to report on.
                  </td>
                </tr>
              )}
              {totals.map((t) => (
                <tr key={t.employeeId} className={rowCls}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{t.name}</div>
                    <div className={`text-xs ${muted}`}>{t.department}</div>
                  </td>
                  <td className="px-4 py-3">{t.days}</td>
                  <td className="px-4 py-3">{fmtDuration(t.minutes)}</td>
                  <td className="px-4 py-3">{t.late ? <Pill tone="amber">{t.late}</Pill> : 0}</td>
                  <td className="px-4 py-3">{t.earlyOut ? <Pill tone="amber">{t.earlyOut}</Pill> : 0}</td>
                  <td className="px-4 py-3">{t.absent ? <Pill tone="red">{t.absent}</Pill> : 0}</td>
                  <td className="px-4 py-3">{t.missing ? <Pill tone="amber">{t.missing}</Pill> : 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className={theadCls}>
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">First in</th>
                <th className="px-4 py-3 font-medium">Last out</th>
                <th className="px-4 py-3 font-medium">Hours</th>
                <th className="px-4 py-3 font-medium">Flags</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className={`px-4 py-8 text-center ${muted}`}>
                    No attendance in this range.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={`${r.employeeId}-${r.date}`} className={rowCls}>
                  <td className="whitespace-nowrap px-4 py-3">{fmtDate(r.date)}</td>
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3">{r.firstIn ? fmtTime(r.firstIn.timestamp) : '—'}</td>
                  <td className="px-4 py-3">{r.lastOut ? fmtTime(r.lastOut.timestamp) : '—'}</td>
                  <td className="px-4 py-3">{fmtDuration(r.minutes)}</td>
                  <td className="space-x-1 px-4 py-3">
                    {r.late && <Pill tone="amber">Late</Pill>}
                    {r.earlyOut && <Pill tone="amber">Early out</Pill>}
                    {r.missingOut && <Pill tone="red">No sign-out</Pill>}
                    {r.missingIn && <Pill tone="red">No sign-in</Pill>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className={`mt-3 text-xs ${muted}`}>
        Absences count days the employee was scheduled (see Schedule; otherwise their default shift on company work days) from the employee's start date; hours only
        count completed sign-in → sign-out pairs.
      </p>
    </div>
  );
}
