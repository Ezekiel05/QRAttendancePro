import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MIN_PASSWORD_LENGTH, useAuth } from '../context/AuthContext.jsx';
import { btnPrimary, cardCls, inputCls, muted } from '../components/ui.jsx';

export default function Login() {
  const { login, setup, needsSetup, expired, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/admin';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isAdmin) navigate(from, { replace: true });
  }, [isAdmin, from, navigate]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (needsSetup && password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    const res = needsSetup ? await setup(username, password) : await login(username, password);
    setBusy(false);
    if (!res.ok) setError(res.error);
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <form onSubmit={submit} className={`${cardCls} w-full max-w-sm p-8`}>
        <h1 className="mb-1 text-xl font-bold">
          {needsSetup ? 'Create admin account' : 'Admin sign in'}
        </h1>
        <p className={`mb-6 text-sm ${muted}`}>
          {needsSetup
            ? 'First run: choose the admin credentials for this device.'
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

        <label className="mb-1 block text-sm font-medium">Username</label>
        <input
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

        <button type="submit" disabled={busy} className={`${btnPrimary} w-full py-2.5`}>
          {busy ? 'Please wait…' : needsSetup ? 'Create account & sign in' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
