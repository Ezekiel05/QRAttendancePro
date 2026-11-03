import React from 'react';

// ---- Shared class names ----
export const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
export const btnPrimary =
  'rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50';
export const btnSecondary =
  'rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600';
export const btnDanger =
  'rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700';
export const cardCls =
  'rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800';
export const theadCls =
  'bg-slate-50 text-left text-slate-500 dark:bg-slate-900/40 dark:text-slate-400';
export const rowCls = 'border-t border-slate-100 dark:border-slate-700';
export const muted = 'text-slate-500 dark:text-slate-400';
export const linkBtn = 'font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400';

const tones = {
  green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  red: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  indigo: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
};

export function Pill({ tone = 'slate', children }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

// Sign in / Sign out pill that also shows late / early-out flags.
export function EventPill({ type, status }) {
  if (type === 'in') {
    return status === 'late' ? (
      <Pill tone="amber">Sign in · Late</Pill>
    ) : (
      <Pill tone="green">Sign in</Pill>
    );
  }
  return status === 'early-out' ? (
    <Pill tone="amber">Sign out · Early</Pill>
  ) : (
    <Pill tone="slate">Sign out</Pill>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className={muted}>{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function StatCard({ label, value, accent = '' }) {
  return (
    <div className={`${cardCls} p-5`}>
      <p className={`text-sm ${muted}`}>{label}</p>
      <p className={`mt-1 text-3xl font-extrabold ${accent}`}>{value}</p>
    </div>
  );
}

export function Pagination({ page, pages, onChange }) {
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-center gap-3 text-sm">
      <button className={btnSecondary} disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </button>
      <span className={muted}>
        Page {page} of {pages}
      </span>
      <button className={btnSecondary} disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Next
      </button>
    </div>
  );
}
