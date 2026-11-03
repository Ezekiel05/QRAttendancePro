import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MIN_PASSWORD_LENGTH, useAuth } from '../context/AuthContext.jsx';
import { btnPrimary, cardCls, inputCls, muted } from '../components/ui.jsx';
import NoAccess from '../components/NoAccess.jsx';
import { useData } from '../context/DataContext.jsx';
import { readStayPreference, writeStayPreference } from '../utils/authStorage.js';

export default function Login() {
  const { login, setup, needsSetup, expired, isAdmin, session, mode, noAccess } = useAuth();
  const { settings } = useData();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/admin';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [stay, setStay] = useState(() => readStayPreference(localStorage));

  useEffect(() => {
    if (isAdmin) navigate(from, { replace: true });
    else if (session) navigate('/scan', { replace: true });
  }, [isAdmin, session, from, navigate]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (needsSetup && password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    writeStayPreference(localStorage, stay);
    const res = needsSetup ? await setup(username, password, stay) : await login(username, password, stay);
    setBusy(false);
    if (!res.ok) setError(res.error);
  }

  if (noAccess) return <NoAccess />;

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <form onSubmit={submit} className={`${cardCls} w-full max-w-sm p-8`}>
        {settings.logo && (
          <img src={settings.logo} alt="" className="mx-auto mb-4 h-16 w-16 object-contain" />
        )}
        <h1 className="mb-1 text-xl font-bold">
          {needsSetup ? 'Create admin account' : mode === 'remote' ? 'Sign in' : 'Admin sign in'}
        </h1>
        <p className={`mb-6 text-sm ${muted}`}>
          {needsSetup
            ? 'First run: choose the admin credentials for this device.'
            : mode === 'remote'
            ? 'Admins manage everything; kiosk accounts only record scans.'
            : 'Manage employees, attendance and reports.'}
        </p>

        {expired && !error && (
          <div className="mb-4 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            You were signed out after a period of inactivity.
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <label className="mb-1 block text-sm font-medium">{mode === 'remote' ? 'Email' : 'Username'}</label>
        <input
          type={mode === 'remote' ? 'email' : 'text'}
          className={`${inputCls} mb-4`}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          autoComplete="username"
          required
        />

        <label className="mb-1 block text-sm font-medium">Password</label>
        <input
          type="password"
          className={`${inputCls} ${needsSetup ? 'mb-4' : 'mb-6'}`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={needsSetup ? 'new-password' : 'current-password'}
          required
        />

        {needsSetup && (
          <>
            <label className="mb-1 block text-sm font-medium">Confirm password</label>
            <input
              type="password"
              className={`${inputCls} mb-1`}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
            <p className={`mb-6 text-xs ${muted}`}>At least {MIN_PASSWORD_LENGTH} characters.</p>
          </>
        )}

        <label className="mb-5 flex items-start gap-2 text-sm">
          <input
            className="mt-1"
            type="checkbox"
            checked={stay}
            onChange={(e) => setStay(e.target.checked)}
          />
          <span>
            Stay signed in on this device
            <span className={`block text-xs ${muted}`}>
              Leave it off on a shared computer. Admins are still signed out after the inactivity timeout set
              in Settings.
            </span>
          </span>
        </label>

        <button type="submit" disabled={busy} className={`${btnPrimary} w-full py-2.5`}>
          {busy ? 'Please wait…' : needsSetup ? 'Create account & sign in' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
