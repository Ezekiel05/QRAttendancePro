import React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { isRemote } from './lib/supabase.js';
import { DataProvider, useData } from './context/DataContext.jsx';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import RemoteAuthProvider from './context/RemoteAuthProvider.jsx';
import RemoteDataProvider from './context/RemoteDataProvider.jsx';
import Navbar from './components/Navbar.jsx';
import NoAccess from './components/NoAccess.jsx';
import SyncBanner from './components/SyncBanner.jsx';
import InactivityGuard from './components/InactivityGuard.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Kiosk from './pages/Kiosk.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Employees from './pages/Employees.jsx';
import BadgePrint from './pages/BadgePrint.jsx';
import Records from './pages/Records.jsx';
import Reports from './pages/Reports.jsx';
import Schedule from './pages/Schedule.jsx';
import Settings from './pages/Settings.jsx';

// Kiosk pages: open to everyone in local mode, signed-in staff only with the shared database.
function RequireStaff({ children }) {
  const { isStaff, noAccess } = useAuth();
  const location = useLocation();
  if (noAccess) return <NoAccess />;
  if (!isStaff) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

function RequireAdmin({ children }) {
  const { isAdmin, noAccess, session } = useAuth();
  const location = useLocation();
  if (noAccess) return <NoAccess />;
  if (!isAdmin) {
    // A kiosk account has no business in the admin area.
    return session ? (
      <Navigate to="/scan" replace />
    ) : (
      <Navigate to="/login" replace state={{ from: location }} />
    );
  }
  return children;
}

const staff = (el) => <RequireStaff>{el}</RequireStaff>;
const guard = (el) => <RequireAdmin>{el}</RequireAdmin>;

function Shell() {
  const auth = useAuth();
  const data = useData();

  return (
    <>
      <Navbar />
      {isRemote && <SyncBanner />}
      {isRemote && <InactivityGuard />}
      <main>
        {auth.loading || data.loading ? (
          <div className="px-4 py-16 text-center text-slate-500">Loading…</div>
        ) : (
          <Routes>
            <Route path="/" element={<Navigate to="/scan" replace />} />
            <Route path="/scan" element={staff(<Kiosk />)} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/admin" element={guard(<Dashboard />)} />
            <Route path="/admin/employees" element={guard(<Employees />)} />
            <Route path="/admin/badges" element={guard(<BadgePrint />)} />
            <Route path="/admin/records" element={guard(<Records />)} />
            <Route path="/admin/reports" element={guard(<Reports />)} />
            <Route path="/admin/schedule" element={guard(<Schedule />)} />
            <Route path="/admin/settings" element={guard(<Settings />)} />
            <Route path="*" element={<Navigate to="/scan" replace />} />
          </Routes>
        )}
      </main>
    </>
  );
}

export default function App() {
  if (isRemote) {
    return (
      <RemoteAuthProvider>
        <RemoteDataProvider>
          <Shell />
        </RemoteDataProvider>
      </RemoteAuthProvider>
    );
  }
  return (
    <DataProvider>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </DataProvider>
  );
}
