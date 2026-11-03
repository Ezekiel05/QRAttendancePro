import React, { useCallback, useEffect, useState } from 'react';
import { AuthContext } from './AuthContext.jsx';
import { supabase } from '../lib/supabase.js';
import { accountDisplayName, cleanDisplayName } from '../utils/accountName.js';

// Sign-in through Supabase Auth. Accounts are created by the owner in the Supabase
// dashboard and given a role ('admin' or 'kiosk') in the app_users table.
export default function RemoteAuthProvider({ children }) {
  const [authSession, setAuthSession] = useState(null);
  const [role, setRole] = useState(null); // 'admin' | 'kiosk' | 'none' | null
  const [booting, setBooting] = useState(true);
  const [roleLoading, setRoleLoading] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setAuthSession(data.session);
        setBooting(false);
      }
    });
    // Keep this callback free of Supabase calls (they can deadlock); just store the session.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setAuthSession(next);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const userId = authSession?.user?.id;
  useEffect(() => {
    if (!userId) {
      setRole(null);
      setRoleLoading(false);
      return undefined;
    }
    let active = true;
    setRoleLoading(true);
    supabase
      .from('app_users')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (active) {
          setRole(data?.role || 'none');
          setRoleLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const email = authSession?.user?.email || '';
  const displayName = accountDisplayName(authSession?.user?.user_metadata, email);

  const login = useCallback(async (emailInput, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: String(emailInput).trim(),
      password
    });
    if (error) return { ok: false, error: error.message };
    setExpired(false);
    return { ok: true };
  }, []);

  const logout = useCallback(async (reason) => {
    await supabase.auth.signOut();
    if (reason === 'timeout') setExpired(true);
  }, []);

  const changePassword = useCallback(
    async (current, next) => {
      if (next.length < 8) return { ok: false, error: 'New password must be at least 8 characters.' };
      const check = await supabase.auth.signInWithPassword({ email, password: current });
      if (check.error) return { ok: false, error: 'Current password is incorrect.' };
      const { error } = await supabase.auth.updateUser({ password: next });
      return error ? { ok: false, error: error.message } : { ok: true };
    },
    [email]
  );

  // The nickname lives in the account's own profile (user_metadata); it is only for display.
  const updateDisplayName = useCallback(async (name) => {
    const { error } = await supabase.auth.updateUser({ data: { display_name: cleanDisplayName(name) } });
    return error ? { ok: false, error: error.message } : { ok: true };
  }, []);

  const isStaff = role === 'admin' || role === 'kiosk';

  const value = {
    mode: 'remote',
    loading: booting || roleLoading,
    session: isStaff ? { username: displayName, role } : null,
    isAdmin: role === 'admin',
    isStaff,
    role,
    noAccess: Boolean(authSession) && role === 'none',
    needsSetup: false,
    adminUsername: email,
    email,
    displayName,
    updateDisplayName,
    expired,
    setup: async () => ({ ok: false, error: 'Accounts are created in the Supabase dashboard.' }),
    login,
    logout,
    changePassword
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
