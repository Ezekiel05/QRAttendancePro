import React, { useMemo, useState } from 'react';
import { useData } from '../context/DataContext.jsx';
import { scheduledShift } from '../utils/attendance.js';
import { addDays, todayKey } from '../utils/time.js';
import { btnSecondary, cardCls, inputCls, muted, PageHeader } from '../components/ui.jsx';

const SHIFT_COLORS = [
  'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200'
];
const OFF_COLOR = 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300';

const mondayOf = (key) => addDays(key, -((new Date(`${key}T00:00:00`).getDay() + 6) % 7));
const dayLabel = (key) =>
  new Date(`${key}T00:00:00`).toLocaleDateString([], { weekday: 'short' });
const dateLabel = (key) =>
  new Date(`${key}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' });

function colorFor(shift, settings) {
  if (!shift) return OFF_COLOR;
  const index = Math.max(0, settings.shifts.findIndex((s) => s.id === shift.id));
  return SHIFT_COLORS[index % SHIFT_COLORS.length];
}

// One day for one employee. Solid = set explicitly, dashed = following the default.
function DaySelect({ employee, dateK, settings, schedule, onChange }) {
  const entry = schedule[employee.id]?.[dateK] || '';
  const resolved = scheduledShift(employee, dateK, settings, schedule);
  const fallback = scheduledShift(employee, dateK, settings, {});
  const options = settings.shifts.filter((s) => s.enabled || s.id === entry);

  return (
    <select
      aria-label={`${employee.name}, ${dayLabel(dateK)} ${dateLabel(dateK)}`}
      value={entry}
      onChange={(e) => onChange(e.target.value || null)}
      className={`w-full rounded-lg border px-2 py-1.5 text-base font-medium sm:text-sm ${colorFor(
        resolved,
        settings
      )} ${entry ? 'border-transparent' : 'border-dashed border-slate-400'}`}
    >
      <option value="">Default ({fallback ? fallback.name : 'Off'})</option>
      <option value="off">Off</option>
      {options.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name} ({s.start}–{s.end})
        </option>
      ))}
    </select>
  );
}

function FillSelect({ shifts, onPick }) {
  return (
    <select
      aria-label="Fill the whole week"
      value=""
      onChange={(e) => onPick(e.target.value)}
      className={`${inputCls} sm:w-auto sm:py-1`}
    >
      <option value="">Fill week…</option>
      {shifts.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name} all week
        </option>
      ))}
      <option value="off">Off all week</option>
      <option value="clear">Reset to default</option>
    </select>
  );
}

export default function Schedule() {
  const { employees, settings, schedule, setScheduleEntries } = useData();
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayKey()));
  const [query, setQuery] = useState('');
  const today = todayKey();

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const active = useMemo(
    () => employees.filter((e) => e.active).sort((a, b) => a.name.localeCompare(b.name)),
    [employees]
  );
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return active.filter(
      (e) => !q || [e.name, e.employeeCode, e.department].some((v) => String(v || '').toLowerCase().includes(q))
    );
  }, [active, query]);
  const enabledShifts = settings.shifts.filter((s) => s.enabled);

  // How many people are on each shift each day (all active employees, not just the filtered ones).
  const coverage = useMemo(
    () =>
      days.map((key) => {
        const counts = {};
        let off = 0;
        for (const emp of active) {
          const s = scheduledShift(emp, key, settings, schedule);
          if (s) counts[s.id] = (counts[s.id] || 0) + 1;
          else off += 1;
        }
        return { key, counts, off };
      }),
    [days, active, settings, schedule]
  );

  const setCell = (employee, key, value) =>
    setScheduleEntries([{ employeeId: employee.id, date: key, value }]);

  function fillWeek(employee, pick) {
    if (!pick) return;
    setScheduleEntries(
      days.map((date) => ({ employeeId: employee.id, date, value: pick === 'clear' ? null : pick }))
    );
  }

  function copyLastWeek() {
    if (!window.confirm('Copy last week\'s schedule over this week for everyone shown? This replaces what is set now.')) {
      return;
    }
    const entries = [];
    for (const emp of visible) {
      for (const date of days) {
        entries.push({ employeeId: emp.id, date, value: schedule[emp.id]?.[addDays(date, -7)] ?? null });
      }
    }
    setScheduleEntries(entries);
  }

  function resetWeek() {
    if (!window.confirm('Reset this week to defaults for everyone shown?')) return;
    setScheduleEntries(
      visible.flatMap((emp) => days.map((date) => ({ employeeId: emp.id, date, value: null })))
    );
  }

  const thisWeek = mondayOf(today);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title="Schedule"
        subtitle="Plot who works which shift each day. Days left on Default use the employee's default shift on company work days."
      >
        <button className={btnSecondary} onClick={() => setWeekStart(addDays(weekStart, -7))}>
          ← Prev
        </button>
        <button
          className={btnSecondary}
          onClick={() => setWeekStart(thisWeek)}
          disabled={weekStart === thisWeek}
        >
          This week
        </button>
        <button className={btnSecondary} onClick={() => setWeekStart(addDays(weekStart, 7))}>
          Next →
        </button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="text-lg font-semibold">
          {dateLabel(days[0])} – {dateLabel(days[6])}
        </div>
        <input
          className={`${inputCls} max-w-xs`}
          placeholder="Search name, code, department…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className={btnSecondary} onClick={copyLastWeek} disabled={!visible.length}>
          Copy last week
        </button>
        <button className={btnSecondary} onClick={resetWeek} disabled={!visible.length}>
          Reset week
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        {enabledShifts.map((s) => (
          <span key={s.id} className={`rounded-full px-2.5 py-1 font-medium ${colorFor(s, settings)}`}>
            {s.name} {s.start}–{s.end}
          </span>
        ))}
        <span className={`rounded-full px-2.5 py-1 font-medium ${OFF_COLOR}`}>Off</span>
        <span className={muted}>Dashed outline = following the default.</span>
      </div>

      {visible.length === 0 && (
        <div className={`${cardCls} px-4 py-8 text-center ${muted}`}>
          {active.length === 0 ? 'Add employees first.' : 'No employees match your search.'}
        </div>
      )}

      {/* Phones: one card per employee */}
      <div className="space-y-3 md:hidden">
        {visible.map((emp) => (
          <div key={emp.id} className={`${cardCls} p-4`}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-semibold">{emp.name}</div>
                <div className={`truncate text-xs ${muted}`}>{emp.department}</div>
              </div>
              <FillSelect shifts={enabledShifts} onPick={(pick) => fillWeek(emp, pick)} />
            </div>
            <div className="space-y-2">
              {days.map((key) => (
                <div key={key} className="grid grid-cols-[4.5rem_1fr] items-center gap-3">
                  <div className={`text-sm ${key === today ? 'font-bold text-indigo-600 dark:text-indigo-400' : muted}`}>
                    {dayLabel(key)} {dateLabel(key).split(' ')[1]}
                  </div>
                  <DaySelect
                    employee={emp}
                    dateK={key}
                    settings={settings}
                    schedule={schedule}
                    onChange={(value) => setCell(emp, key, value)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Tablets and desktops: weekly grid */}
      {visible.length > 0 && (
        <div className={`${cardCls} hidden overflow-x-auto md:block`}>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-900/40 dark:text-slate-400">
              <tr>
                <th className="min-w-[11rem] px-4 py-3 font-medium">Employee</th>
                {days.map((key) => (
                  <th
                    key={key}
                    className={`min-w-[8.5rem] px-2 py-3 font-medium ${
                      key === today ? 'text-indigo-600 dark:text-indigo-400' : ''
                    }`}
                  >
                    <div>{dayLabel(key)}</div>
                    <div className="text-xs font-normal">{dateLabel(key)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((emp) => (
                <tr key={emp.id} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="px-4 py-2">
                    <div className="font-medium">{emp.name}</div>
                    <div className={`mb-1 text-xs ${muted}`}>{emp.department}</div>
                    <FillSelect shifts={enabledShifts} onPick={(pick) => fillWeek(emp, pick)} />
                  </td>
                  {days.map((key) => (
                    <td key={key} className="px-2 py-2">
                      <DaySelect
                        employee={emp}
                        dateK={key}
                        settings={settings}
                        schedule={schedule}
                        onChange={(value) => setCell(emp, key, value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 text-xs dark:border-slate-600 dark:bg-slate-900/40">
              {enabledShifts.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2 font-medium">{s.name} (headcount)</td>
                  {coverage.map((c) => (
                    <td key={c.key} className="px-2 py-2 text-center">
                      {c.counts[s.id] || 0}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="px-4 py-2 font-medium">Off</td>
                {coverage.map((c) => (
                  <td key={c.key} className="px-2 py-2 text-center">
                    {c.off}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
