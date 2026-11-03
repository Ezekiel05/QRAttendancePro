import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext.jsx';
import BadgeCard from '../components/BadgeCard.jsx';
import { btnPrimary, btnSecondary, muted, PageHeader } from '../components/ui.jsx';

export default function BadgePrint() {
  const { employees, settings } = useData();
  const active = employees.filter((e) => e.active).sort((a, b) => a.name.localeCompare(b.name));
  const [unselected, setUnselected] = useState(() => new Set());

  const selected = active.filter((e) => !unselected.has(e.id));

  const toggle = (id) =>
    setUnselected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="no-print">
        <PageHeader
          title="Print badges"
          subtitle={`${selected.length} of ${active.length} active employees selected.`}
        >
          <Link to="/admin/employees" className={btnSecondary}>
            Back
          </Link>
          <button className={btnPrimary} onClick={() => window.print()} disabled={!selected.length}>
            Print
          </button>
        </PageHeader>

        {active.length === 0 && <p className={muted}>Add employees first.</p>}
        <div className="mb-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {active.map((e) => (
            <label key={e.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!unselected.has(e.id)}
                onChange={() => toggle(e.id)}
              />
              {e.name}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 justify-items-center gap-6 md:grid-cols-3 lg:grid-cols-4 print:grid-cols-3">
        {selected.map((e) => (
          <BadgeCard key={e.id} employee={e} company={settings.companyName} />
        ))}
      </div>
    </div>
  );
}
