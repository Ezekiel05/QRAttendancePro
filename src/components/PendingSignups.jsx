import React, { useState } from 'react';
import { btnPrimary, btnSecondary, cardCls, inputCls, muted, Pill } from './ui.jsx';
import { distance } from '../utils/face.js';
import { fmtDateTime } from '../utils/time.js';

// Name of an already-enrolled employee whose face looks like this registration, if any.
function lookalike(reg, employees, threshold) {
  if (!reg.faceDescriptors?.length) return null;
  for (const emp of employees) {
    if (!emp.faceDescriptors?.length) continue;
    const closest = Math.min(
      ...emp.faceDescriptors.flatMap((a) => reg.faceDescriptors.map((b) => distance(a, b)))
    );
    if (closest < threshold + 0.05) return emp.name;
  }
  return null;
}

export default function PendingSignups({ pending, employees, shifts, threshold, onApprove, onReject }) {
  const [picked, setPicked] = useState({});
  if (!pending.length) return null;

  const enabled = shifts.filter((s) => s.enabled);
  const defaultShift = (enabled[0] || shifts[0]).id;

  return (
    <section className={`${cardCls} mb-6 border-amber-300 p-5 dark:border-amber-700`}>
      <h2 className="mb-1 font-semibold">Pending signups ({pending.length})</h2>
      <p className={`mb-4 text-sm ${muted}`}>
        Check the photo matches the person, choose their shift, then approve. Their saved QR badge
        starts working on approval.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {pending.map((reg) => {
          const look = lookalike(reg, employees, threshold);
          const shiftId = picked[reg.id] || defaultShift;
          return (
            <div
              key={reg.id}
              className="flex gap-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700"
            >
              {reg.photo ? (
                <img src={reg.photo} alt="" className="h-24 w-24 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="h-24 w-24 shrink-0 rounded-lg bg-slate-200 dark:bg-slate-700" />
              )}
              <div className="min-w-0 flex-1 text-sm">
                <div className="truncate font-semibold">{reg.name}</div>
                <div className={muted}>
                  {[reg.position, reg.department].filter(Boolean).join(' · ')}
                </div>
                {reg.email && <div className={`truncate ${muted}`}>{reg.email}</div>}
                <div className={`text-xs ${muted}`}>Submitted {fmtDateTime(reg.submittedAt)}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {reg.faceDescriptors?.length > 0 && <Pill tone="indigo">Face captured</Pill>}
                  {look && <Pill tone="amber">Looks like {look}</Pill>}
                </div>
                <select
                  className={`${inputCls} mt-2`}
                  value={shiftId}
                  onChange={(e) => setPicked((p) => ({ ...p, [reg.id]: e.target.value }))}
                  aria-label="Shift"
                >
                  {enabled.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.start}–{s.end})
                    </option>
                  ))}
                </select>
                <div className="mt-3 flex gap-2">
                  <button className={btnPrimary} onClick={() => onApprove(reg, look, shiftId)}>
                    Approve
                  </button>
                  <button className={btnSecondary} onClick={() => onReject(reg)}>
                    Reject
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
