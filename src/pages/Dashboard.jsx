import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext.jsx';
import {
  buildReport,
  isPresentNow,
  isWorkDay,
  lastRecordFor,
  shiftFor,
  shiftForScan,
  shiftHasStarted,
  workDateOf
} from '../utils/attendance.js';
import { addDays, dateKey, fmtTime, rangeKeys, todayKey } from '../utils/time.js';
import { branchName } from '../utils/branches.js';
import {
  btnPrimary,
  btnSecondary,
  cardCls,
  EventPill,
  muted,
  PageHeader,
  Pill,
  StatCard
} from '../components/ui.jsx';

export default function Dashboard() {
  const { employees, records, settings, schedule, patterns, mode } = useData();
  const today = todayKey();
  const active = useMemo(() => employees.filter((e) => e.active), [employees]);

  const rows = useMemo(
    () => buildReport(records, employees, addDays(today, -6), today),
    [records, employees, today]
  );
  const todayRows = rows.filter((r) => r.date === today);

  const now = new Date();
  const presentNow = active.filter((e) => isPresentNow(records, e.id, now, shiftFor(e, settings)));
  // Where each person who is in right now signed in.
  const lastBranchOf = (e) => lastRecordFor(records, e.id)?.branchId || '';
  const branchCounts = (settings.branches || [])
    .filter((b) => b.active !== false)
    .map((b) => ({ id: b.id, name: b.name, count: presentNow.filter((e) => lastBranchOf(e) === b.id).length }));
  const noBranchCount = presentNow.filter((e) => !lastBranchOf(e)).length;
  const lateToday = todayRows.filter((r) => r.late).length;
  // Only people scheduled today whose shift has already started and who have not signed in for it.
  const notIn = active.filter((e) => {
    const { shift, scheduled } = shiftForScan(e, now, settings, schedule, patterns);
    if (!scheduled || !shiftHasStarted(shift, now)) return false;
    const workDate = workDateOf(now, shift);
    if (isPresentNow(records, e.id, now, shift)) return false;
    return !rows.some((r) => r.employeeId === e.id && r.date === workDate && r.firstIn);
  });

  const trend = rangeKeys(addDays(today, -6), today).map((k) => {
    const dayRows = rows.filter((r) => r.date === k && r.firstIn);
    return {
      key: k,
      label: new Date(`${k}T00:00:00`).toLocaleDateString([], { weekday: 'short' }),
      present: dayRows.length,
      late: dayRows.filter((r) => r.late).length
    };
  });
  const chartMax = Math.max(1, active.length, ...trend.map((t) => t.present));

  const recent = [...records].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 8);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader title="Dashboard" subtitle="Today's attendance at a glance.">
        <Link to="/admin/employees" className={btnPrimary}>
          Manage employees
        </Link>
        <Link to="/admin/reports" className={btnSecondary}>
          Reports
        </Link>
      </PageHeader>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active employees" value={active.length} />
        <StatCard label="Signed in now" value={presentNow.length} accent="text-emerald-600" />
        <StatCard label="Late today" value={lateToday} accent="text-amber-600" />
        <StatCard
          label="Not in yet"
          value={notIn.length}
          accent="text-red-600"
        />
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-3">
        <div className={`${cardCls} p-5 lg:col-span-2`}>
          <h2 className="mb-1 font-semibold">Last 7 days</h2>
          <p className={`mb-4 text-xs ${muted}`}>
            Employees who signed in each day. <span className="text-amber-500">Amber</span> = late.
          </p>
          <div className="flex h-44 items-end gap-3">
            {trend.map((t) => (
              <div key={t.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-xs font-medium">{t.present}</span>
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="relative w-full overflow-hidden rounded-t-md bg-indigo-500"
                    style={{ height: `${(t.present / chartMax) * 100}%` }}
                    title={`${t.present} present, ${t.late} late`}
                  >
                    <div
                      className="absolute bottom-0 w-full bg-amber-400"
                      style={{ height: `${t.present ? (t.late / t.present) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                <span className={`text-xs ${muted}`}>{t.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={`${cardCls} p-5`}>
          <h2 className="mb-3 font-semibold">Currently in ({presentNow.length})</h2>
          {presentNow.length === 0 && <p className={`text-sm ${muted}`}>Nobody is signed in.</p>}
          <ul className="space-y-2 text-sm">
            {presentNow.map((e) => {
              const last = lastRecordFor(records, e.id);
              return (
                <li key={e.id} className="flex items-center justify-between">
                  <span className="font-medium">{e.name}</span>
                  <span className={muted}>
                    since {fmtTime(last.timestamp)}
                    {last.branchId ? ` · ${branchName(settings, last.branchId)}` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {mode === 'remote' && branchCounts.length > 0 && (
        <div className={`${cardCls} mb-6 p-5`}>
          <h2 className="mb-3 font-semibold">Signed in now, by branch</h2>
          <div className="flex flex-wrap gap-3">
            {branchCounts.map((b) => (
              <div key={b.id} className="min-w-[8rem] rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
                <div className={`text-xs ${muted}`}>{b.name}</div>
                <div className="text-2xl font-extrabold">{b.count}</div>
              </div>
            ))}
            {noBranchCount > 0 && (
              <div className="min-w-[8rem] rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
                <div className={`text-xs ${muted}`}>No branch</div>
                <div className="text-2xl font-extrabold">{noBranchCount}</div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className={`${cardCls} p-5`}>
          <h2 className="mb-3 font-semibold">Not signed in yet ({notIn.length})</h2>
          {notIn.length === 0 && (
            <p className={`text-sm ${muted}`}>
              Nobody is waiting to sign in.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {notIn.map((e) => (
              <Pill key={e.id} tone="red">
                {e.name}
              </Pill>
            ))}
          </div>
        </div>

        <div className={`${cardCls} p-5`}>
          <h2 className="mb-3 font-semibold">Recent activity</h2>
          {recent.length === 0 && <p className={`text-sm ${muted}`}>No scans recorded yet.</p>}
          <ul className="space-y-2 text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{r.employeeName}</span>
                <span className="flex items-center gap-2">
                  <EventPill type={r.type} status={r.status} />
                  <span className={`${muted} whitespace-nowrap`}>
                    {dateKey(r.timestamp) === today ? '' : `${dateKey(r.timestamp)} `}
                    {fmtTime(r.timestamp)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
