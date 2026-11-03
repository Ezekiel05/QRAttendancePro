import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';

// Signs an admin out after a period without activity (0 = never). Kiosk accounts
// are never timed out, so a tablet at the entrance stays signed in.
export default function InactivityGuard() {
  const { role, logout } = useAuth();
  const { settings } = useData();

  useEffect(() => {
    if (role !== 'admin') return undefined;
    const minutes = Number(settings.sessionTimeoutMin);
    if (!(minutes > 0)) return undefined;

    let last = Date.now();
    const bump = () => {
      last = Date.now();
    };
    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, bump, { passive: true }));
    const timer = setInterval(() => {
      if (Date.now() - last > minutes * 60000) logout('timeout');
    }, 10000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, bump));
      clearInterval(timer);
    };
  }, [role, settings.sessionTimeoutMin, logout]);

  return null;
}
