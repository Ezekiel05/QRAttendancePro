import React from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { BADGE_PREFIX } from '../utils/attendance.js';

// Fixed (non-themed) colours so printed badges always look the same.
export default function BadgeCard({ employee, company, size = 180 }) {
  return (
    <div className="badge-card w-full max-w-[14rem] overflow-hidden rounded-xl border border-slate-300 bg-white text-center text-slate-900 shadow-sm">
      <div className="truncate bg-indigo-600 px-3 py-2 text-sm font-bold text-white">{company}</div>
      <div className="flex justify-center p-3">
        <QRCodeCanvas
          value={BADGE_PREFIX + employee.badgeToken}
          size={size}
          includeMargin
          style={{ width: '100%', height: 'auto', maxWidth: size }}
        />
      </div>
      <div className="px-3 pb-4">
        <div className="truncate font-bold">{employee.name}</div>
        <div className="truncate text-xs text-slate-500">
          {employee.position || employee.department}
        </div>
        <div className="mt-1 font-mono text-xs text-slate-600">{employee.employeeCode}</div>
      </div>
    </div>
  );
}
