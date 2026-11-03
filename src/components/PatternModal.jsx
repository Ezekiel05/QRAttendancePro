import React, { useState } from 'react';
import Modal from './Modal.jsx';
import { btnDanger, btnPrimary, btnSecondary, inputCls, muted } from './ui.jsx';
import {
  makeScheduleValue,
  parseScheduleValue,
  scheduledBranch,
  scheduledShift
} from '../utils/attendance.js';
import { branchName } from '../utils/branches.js';
import { addDays, mondayOfKey } from '../utils/time.js';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const label = (key) =>
  new Date(`${key}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' });

// One week of the pattern. `cells` hold '' (Default), 'off' or a shift id per day;
// `branch` is the branch worked all that week ('' = the employee's own branch).
function WeekEditor({ index, anchor, cells, branch, shifts, branches, homeName, onCells, onBranch }) {
  const enabled = shifts.filter((s) => s.enabled);
  const setDay = (i, value) => onCells(cells.map((v, j) => (j === i ? value : v)));
  const fill = (pick) => {
    if (pick) onCells(Array(7).fill(pick === 'default' ? '' : pick));
  };

  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">
          Week {index + 1}{' '}
          <span className={`font-normal ${muted}`}>(first applies week of {label(addDays(anchor, index * 7))})</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {branches.length > 0 && (
            <select
              aria-label={`Branch for week ${index + 1}`}
              value={branch}
              onChange={(e) => onBranch(e.target.value)}
              className={`${inputCls} sm:w-auto sm:py-1`}
            >
              <option value="">Home{homeName ? ` (${homeName})` : ''}</option>
              {branches
                .filter((b) => b.active !== false || b.id === branch)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    At {b.name}
                  </option>
                ))}
            </select>
          )}
          <select
            aria-label={`Fill week ${index + 1}`}
            value=""
            onChange={(e) => fill(e.target.value)}
            className={`${inputCls} sm:w-auto sm:py-1`}
          >
            <option value="">Fill week…</option>
            {enabled.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} all week
              </option>
            ))}
            <option value="off">Off all week</option>
            <option value="default">Default all week</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {DAYS.map((day, i) => (
          <label key={day} className="text-xs">
            <span className={muted}>{day}</span>
            <select
              className={`${inputCls} mt-0.5`}
              value={cells[i]}
              onChange={(e) => setDay(i, e.target.value)}
            >
              <option value="">Default</option>
              <option value="off">Off</option>
              {shifts
                .filter((s) => s.enabled || s.id === cells[i])
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}

export default function PatternModal({
  employee,
  existing,
  settings,
  schedule,
  patterns,
  branches = [],
  viewWeek,
  onSave,
  onRemove,
  onClose
}) {
  const [anchor, setAnchor] = useState(existing?.anchor || viewWeek);

  // Per week: the shift of each day, and the branch worked that week.
  const [weeks, setWeeks] = useState(() => {
    if (existing?.weeks?.length) {
      return existing.weeks.map((w) =>
        w.map((v) => {
          const p = parseScheduleValue(v);
          return p.off ? 'off' : p.shiftId;
        })
      );
    }
    // Start from what the visible week looks like right now (manual days, pattern, defaults).
    return [
      Array.from({ length: 7 }, (_, i) => {
        const s = scheduledShift(employee, addDays(viewWeek, i), settings, schedule, patterns);
        return s ? s.id : 'off';
      })
    ];
  });
  const [weekBranches, setWeekBranches] = useState(() => {
    if (existing?.weeks?.length) {
      return existing.weeks.map((w) => {
        for (const v of w) {
          const p = parseScheduleValue(v);
          if (!p.off && p.branchId) return p.branchId;
        }
        return '';
      });
    }
    // Start from the branch the visible week is scheduled at, when it is not their own branch.
    for (let i = 0; i < 7; i += 1) {
      const key = addDays(viewWeek, i);
      if (!scheduledShift(employee, key, settings, schedule, patterns)) continue;
      const b = scheduledBranch(employee, key, schedule, patterns);
      return [b && b !== employee.branchId ? b : ''];
    }
    return [''];
  });

  function setCycle(count) {
    setWeeks((prev) =>
      count <= prev.length
        ? prev.slice(0, count)
        : [...prev, ...Array.from({ length: count - prev.length }, () => Array(7).fill(''))]
    );
    setWeekBranches((prev) =>
      count <= prev.length ? prev.slice(0, count) : [...prev, ...Array(count - prev.length).fill('')]
    );
  }

  function save() {
    onSave({
      anchor,
      weeks: weeks.map((cells, wi) =>
        cells.map((c) => (c === 'off' ? 'off' : makeScheduleValue({ shiftId: c, branchId: weekBranches[wi] || '' })))
      )
    });
  }

  const homeName = branchName(settings, employee.branchId);

  return (
    <Modal title={`Repeat pattern · ${employee.name}`} onClose={onClose} xwide>
      <p className={`mb-4 text-sm ${muted}`}>
        Set it once and it repeats on its own. Days you set by hand on the grid still win, and nothing
        before the starting week is changed.
        {branches.length > 0 && ' Choose a branch for a week if they work somewhere other than their own branch.'}
      </p>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Repeat every</label>
          <select
            className={inputCls}
            value={weeks.length}
            onChange={(e) => setCycle(Number(e.target.value))}
          >
            <option value={1}>1 week (same every week)</option>
            <option value={2}>2 weeks (alternating)</option>
            <option value={3}>3 weeks</option>
            <option value={4}>4 weeks</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Starting week</label>
          <input
            type="date"
            className={inputCls}
            value={anchor}
            onChange={(e) => e.target.value && setAnchor(mondayOfKey(e.target.value))}
          />
          <p className={`mt-1 text-xs ${muted}`}>Week of Monday {label(anchor)}</p>
        </div>
      </div>

      <div className="space-y-3">
        {weeks.map((cells, i) => (
          <WeekEditor
            key={i}
            index={i}
            anchor={anchor}
            cells={cells}
            branch={weekBranches[i] || ''}
            shifts={settings.shifts}
            branches={branches}
            homeName={homeName}
            onCells={(c) => setWeeks((prev) => prev.map((x, j) => (j === i ? c : x)))}
            onBranch={(b) => setWeekBranches((prev) => prev.map((x, j) => (j === i ? b : x)))}
          />
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button className={`${btnPrimary} flex-1`} onClick={save}>
          Save pattern
        </button>
        {existing && (
          <button className={btnDanger} onClick={onRemove}>
            Remove pattern
          </button>
        )}
        <button className={btnSecondary} onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
