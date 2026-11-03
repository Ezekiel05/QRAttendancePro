import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { btnPrimary, btnSecondary, cardCls, inputCls, muted } from './ui.jsx';

// Shown to a kiosk account on a device that has not been authorised with the kiosk code yet.
export default function KioskActivation() {
  const { activateKiosk } = useData();
  const { logout, displayName } = useAuth();
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const res = await activateKiosk(code, label);
    setBusy(false);
    if (!res.ok) setError(res.error);
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <form onSubmit={submit} className={`${cardCls} w-full max-w-sm p-8`}>
        <h1 className="mb-1 text-xl font-bold">Activate this kiosk</h1>
        <p className={`mb-6 text-sm ${muted}`}>
          Signed in as {displayName}. This device is not authorised yet: enter the kiosk code from an admin to
          use it for scanning.
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <label className="mb-1 block text-sm font-medium">Kiosk code</label>
        <input
          type="password"
          className={`${inputCls} mb-4`}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          autoFocus
          required
        />

        <label className="mb-1 block text-sm font-medium">Device name (optional)</label>
        <input
          className={`${inputCls} mb-1`}
          value={label}
          maxLength={80}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Front desk tablet"
        />
        <p className={`mb-6 text-xs ${muted}`}>Shown to admins in Settings so they can tell devices apart.</p>

        <button type="submit" disabled={busy} className={`${btnPrimary} w-full py-2.5`}>
          {busy ? 'Checking…' : 'Activate this device'}
        </button>
        <button type="button" className={`${btnSecondary} mt-3 w-full`} onClick={() => logout()}>
          Sign out
        </button>
      </form>
    </div>
  );
}
