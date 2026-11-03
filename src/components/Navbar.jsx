import React from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { useTheme } from '../utils/useTheme.js';

const linkCls = ({ isActive }) =>
  `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-indigo-600 text-white'
      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
  }`;

export default function Navbar() {
  const { isAdmin, logout, session } = useAuth();
  const { settings } = useData();
  const [dark, toggleTheme] = useTheme();
  const navigate = useNavigate();

  return (
    <nav className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
        <Link to="/scan" className="flex items-center gap-2 text-lg font-extrabold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm text-white">
            QR
          </span>
          <span className="max-w-[8rem] truncate sm:max-w-[14rem]">{settings.companyName}</span>
        </Link>

        <div className="no-scrollbar order-3 flex w-full gap-1 overflow-x-auto md:order-none md:w-auto">
          <NavLink to="/scan" className={linkCls}>
            Kiosk
          </NavLink>
          {settings.selfSignupEnabled && (
            <NavLink to="/signup" className={linkCls}>
              Sign up
            </NavLink>
          )}
          {isAdmin && (
            <>
              <NavLink to="/admin" end className={linkCls}>
                Dashboard
              </NavLink>
              <NavLink to="/admin/employees" className={linkCls}>
                Employees
              </NavLink>
              <NavLink to="/admin/schedule" className={linkCls}>
                Schedule
              </NavLink>
              <NavLink to="/admin/records" className={linkCls}>
                Log
              </NavLink>
              <NavLink to="/admin/reports" className={linkCls}>
                Reports
              </NavLink>
              <NavLink to="/admin/settings" className={linkCls}>
                Settings
              </NavLink>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
            className="rounded-lg px-2 py-2 text-lg hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            {dark ? '☀️' : '🌙'}
          </button>
          {isAdmin ? (
            <>
              <span className="hidden text-sm text-slate-500 dark:text-slate-400 sm:inline">
                <b>{session.username}</b>
              </span>
              <button
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
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
              Admin Sign In
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
