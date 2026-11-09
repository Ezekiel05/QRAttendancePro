import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { useTheme } from '../utils/useTheme.js';
import { currentLabel, menuSections } from '../utils/menu.js';
import ProfileModal from './ProfileModal.jsx';

const itemCls = ({ isActive }) =>
  `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-indigo-600 text-white'
      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700'
  }`;

function Brand({ settings }) {
  return (
    <>
      {settings.logo ? (
        <img src={settings.logo} alt="" className="h-8 w-8 rounded-lg object-contain" />
      ) : (
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm text-white">
          QR
        </span>
      )}
      <span className="max-w-[8rem] truncate sm:max-w-[14rem]">{settings.companyName}</span>
    </>
  );
}

export default function Navbar() {
  const { isAdmin, logout, session, displayName } = useAuth();
  const { settings, mode, pendingAccountCount } = useData();
  const [dark, toggleTheme] = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const sections = menuSections({
    isAdmin,
    signedIn: Boolean(session),
    signupEnabled: Boolean(settings.selfSignupEnabled)
  });
  const here = currentLabel(sections, pathname);

  // Use the logo as the browser tab icon too.
  useEffect(() => {
    let link = document.querySelector("link[rel~='icon']");
    if (!settings.logo) {
      if (link && link.dataset.qrap) link.remove();
      return;
    }
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.dataset.qrap = '1';
    link.href = settings.logo;
  }, [settings.logo]);

  // Close the menu when the page changes, and on Escape.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  function signOut() {
    setMenuOpen(false);
    logout();
    navigate('/login');
  }

  return (
    <nav className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="main-menu"
            className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            {pendingAccountCount > 0 && (
              <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-amber-500" title="New accounts are waiting for a role" />
            )}
          </button>
          <Link to="/scan" className="flex min-w-0 items-center gap-2 text-lg font-extrabold">
            <Brand settings={settings} />
          </Link>
          {here && (
            <span className="hidden truncate text-sm text-slate-500 dark:text-slate-400 md:inline">/ {here}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {session && (
            <span
              title={
                mode === 'remote'
                  ? 'Connected to the shared database'
                  : 'Local mode: data is stored in this browser only'
              }
              className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex ${
                mode === 'remote'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {mode === 'remote' ? 'Shared DB' : 'Local only'}
            </span>
          )}
          <button
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
            className="rounded-lg px-2 py-2 text-lg hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            {dark ? '☀️' : '🌙'}
          </button>
          {session ? (
            <>
              <button
                onClick={() => setProfileOpen(true)}
                title="Edit your display name"
                className="hidden max-w-[10rem] truncate rounded-lg px-2 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 sm:inline"
              >
                {displayName}
              </button>
              <button
                onClick={signOut}
                className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              >
                Sign Out
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <aside
            id="main-menu"
            role="dialog"
            aria-label="Menu"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl dark:bg-slate-800"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <div className="flex min-w-0 items-center gap-2 text-lg font-extrabold">
                <Brand settings={settings} />
              </div>
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3">
              {sections.map((section) => (
                <div key={section.title} className="mb-4">
                  <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {section.title}
                  </p>
                  <div className="space-y-0.5">
                    {section.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        className={itemCls}
                        onClick={() => setMenuOpen(false)}
                      >
                        {item.label}
                        {item.to === '/admin/settings' && pendingAccountCount > 0 && (
                          <span className="ml-2 rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white">
                            {pendingAccountCount}
                          </span>
                        )}
                      </NavLink>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {session && (
              <div className="border-t border-slate-200 p-3 text-sm dark:border-slate-700">
                <p className="mb-2 truncate px-1 text-slate-500 dark:text-slate-400">
                  Signed in as <b>{displayName}</b>
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setProfileOpen(true);
                    }}
                    className="flex-1 rounded-lg bg-slate-100 px-3 py-2 font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                  >
                    Display name
                  </button>
                  <button
                    onClick={signOut}
                    className="flex-1 rounded-lg bg-slate-100 px-3 py-2 font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
    </nav>
  );
}
