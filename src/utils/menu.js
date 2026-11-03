// What the hamburger menu shows, grouped into categories.
export function menuSections({ isAdmin, signedIn, signupEnabled }) {
  const attendance = [{ to: '/scan', label: 'Kiosk' }];
  if (isAdmin) {
    attendance.push(
      { to: '/admin', label: 'Dashboard', end: true },
      { to: '/admin/records', label: 'Attendance log' },
      { to: '/admin/reports', label: 'Reports' }
    );
  }
  const sections = [{ title: 'Attendance', items: attendance }];

  if (isAdmin) {
    sections.push(
      {
        title: 'People',
        items: [
          { to: '/admin/employees', label: 'Employees' },
          { to: '/admin/schedule', label: 'Schedule' }
        ]
      },
      {
        title: 'Tools',
        items: [
          { to: '/admin/qr', label: 'QR codes' },
          { to: '/admin/badges', label: 'Print badges' }
        ]
      },
      { title: 'Admin', items: [{ to: '/admin/settings', label: 'Settings' }] }
    );
  }

  if (!signedIn) {
    const account = [{ to: '/login', label: 'Sign in' }];
    if (signupEnabled) account.push({ to: '/signup', label: 'Employee signup' });
    sections.push({ title: 'Account', items: account });
  }
  return sections;
}

// Label of the page being shown (the longest matching menu entry), or '' if none matches.
export function currentLabel(sections, pathname) {
  let best = null;
  for (const section of sections) {
    for (const item of section.items) {
      const exact = pathname === item.to;
      const nested = item.to !== '/admin' && pathname.startsWith(`${item.to}/`);
      if ((exact || nested) && (!best || item.to.length > best.to.length)) best = item;
    }
  }
  return best ? best.label : '';
}
