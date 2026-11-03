import React from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { btnSecondary, cardCls, muted } from './ui.jsx';

export default function NoAccess() {
  const { logout, adminUsername } = useAuth();
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className={`${cardCls} p-6 text-center`}>
        <h1 className="mb-2 text-xl font-bold">No access yet</h1>
        <p className={`mb-4 text-sm ${muted}`}>
          {adminUsername} is signed in, but this account has not been given a role. Ask an admin to add it as
          an <b>admin</b> or <b>kiosk</b> account (see the README).
        </p>
        <button className={btnSecondary} onClick={() => logout()}>
          Sign out
        </button>
      </div>
    </div>
  );
}
