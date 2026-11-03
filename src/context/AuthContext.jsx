import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { KEYS, load, save } from '../utils/storage.js';
import { hashPassword, randomHex } from '../utils/crypto.js';
import { cleanDisplayName } from '../utils/accountName.js';
import { useData } from './DataContext.jsx';

export const AuthContext = createContext(null);

const SESSION_KEY = 'qrap_session'; // sessionStorage: signed out when the tab closes
const MAX_ATTEMPTS = 5;
const LOCK_MS = 60 * 1000;
export const MIN_PASSWORD_LENGTH = 8;

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const { settings } = useData();
  const [auth, setAuth] = useState(() => load(KEYS.auth, null)); // { username, salt, hash }
  const [session, setSession] = useState(readSession);
  const [expired, setExpired] = useState(false);
  const lastActive = useRef(Date.now());

  const startSession = useCallback((username, stay = false) => {
    const s = { username, startedAt: new Date().toISOString() };
    // "Stay signed in" keeps the session across browser restarts; otherwise it ends with the tab.
    const [use, other] = stay ? [localStorage, sessionStorage] : [sessionStorage, localStorage];
    use.setItem(SESSION_KEY, JSON.stringify(s));
    other.removeItem(SESSION_KEY);
    lastActive.current = Date.now();
    setExpired(false);
    setSession(s);
  }, []);

  const logout = useCallback((reason) => {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    if (reason === 'timeout') setExpired(true);
  }, []);

  // Auto sign-out after a period of inactivity (0 = never).
  useEffect(() => {
    if (!session) return undefined;
    const minutes = Number(settings.sessionTimeoutMin);
    if (!(minutes > 0)) return undefined;

    const bump = () => {
      lastActive.current = Date.now();
    };
    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, bump, { passive: true }));
    const timer = setInterval(() => {
      if (Date.now() - lastActive.current > minutes * 60000) logout('timeout');
    }, 10000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, bump));
      clearInterval(timer);
    };
  }, [session, settings.sessionTimeoutMin, logout]);

  async function setup(username, password, stay = false) {
    if (auth) return { ok: false, error: 'An admin account already exists.' };
    const name = username.trim();
    if (!name) return { ok: false, error: 'Choose a username.' };
    if (password.length < MIN_PASSWORD_LENGTH) {
      return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
    }
    try {
      const salt = randomHex(16);
      const record = { username: name, salt, hash: await hashPassword(password, salt) };
      save(KEYS.auth, record);
      setAuth(record);
      startSession(name, stay);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async function login(username, password, stay = false) {
    if (!auth) return { ok: false, error: 'No admin account yet.' };

    const lock = load(KEYS.lock, { count: 0, until: 0 });
    if (Date.now() < lock.until) {
      const secs = Math.ceil((lock.until - Date.now()) / 1000);
      return { ok: false, error: `Too many failed attempts. Try again in ${secs}s.` };
    }

    try {
      const hash = await hashPassword(password, auth.salt);
      if (username.trim().toLowerCase() === auth.username.toLowerCase() && hash === auth.hash) {
        save(KEYS.lock, { count: 0, until: 0 });
        startSession(auth.username, stay);
        return { ok: true };
      }
    } catch (err) {
      return { ok: false, error: err.message };
    }

    const count = lock.count + 1;
    if (count >= MAX_ATTEMPTS) {
      save(KEYS.lock, { count: 0, until: Date.now() + LOCK_MS });
      return { ok: false, error: 'Too many failed attempts. Locked for 60 seconds.' };
    }
    save(KEYS.lock, { count, until: 0 });
    return { ok: false, error: `Invalid username or password. ${MAX_ATTEMPTS - count} attempts left.` };
  }

  async function changePassword(current, next) {
    if (!auth) return { ok: false, error: 'No admin account.' };
    if (next.length < MIN_PASSWORD_LENGTH) {
      return { ok: false, error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
    }
    try {
      if ((await hashPassword(current, auth.salt)) !== auth.hash) {
        return { ok: false, error: 'Current password is incorrect.' };
      }
      const salt = randomHex(16);
      const record = { ...auth, salt, hash: await hashPassword(next, salt) };
      save(KEYS.auth, record);
      setAuth(record);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async function updateDisplayName(name) {
    if (!auth) return { ok: false, error: 'No admin account.' };
    const record = { ...auth, displayName: cleanDisplayName(name) };
    save(KEYS.auth, record);
    setAuth(record);
    return { ok: true };
  }

  const value = {
    mode: 'local',
    isStaff: true, // local mode: the kiosk page is open to everyone
    loading: false,
    session,
    isAdmin: !!session,
    needsSetup: !auth,
    adminUsername: auth ? auth.username : '',
    email: '',
    displayName: (auth && cleanDisplayName(auth.displayName)) || (auth ? auth.username : ''),
    updateDisplayName,
    expired,
    setup,
    login,
    logout,
    changePassword
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
