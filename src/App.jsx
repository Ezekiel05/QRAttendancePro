import React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { DataProvider } from './context/DataContext.jsx';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import Navbar from './components/Navbar.jsx';
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

function RequireAdmin({ children }) {
  const { isAdmin } = useAuth();
  const location = useLocation();
  if (!isAdmin) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

const guard = (el) => <RequireAdmin>{el}</RequireAdmin>;

export default function App() {
  return (
    <DataProvider>
      <AuthProvider>
        <Navbar />
        <main>
          <Routes>
            <Route path="/" element={<Navigate to="/scan" replace />} />
            <Route path="/scan" element={<Kiosk />} />
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
        </main>
      </AuthProvider>
    </DataProvider>
  );
}
