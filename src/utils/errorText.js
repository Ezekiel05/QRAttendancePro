// True when a database function is not installed (e.g. an optional SQL file was not run).
export const isMissingFunction = (err) =>
  err?.code === 'PGRST202' || /Could not find the function/i.test(String(err?.message || ''));

// Turns a raw database/network error into a message that says what to check.
// Returns null when it has nothing better than the original message.
export function describeLoadError(err, host) {
  const msg = String(err?.message || err || '');
  const code = err?.code;

  if (/Load failed|Failed to fetch|NetworkError|network request failed/i.test(msg)) {
    return `Can't reach the database${host ? ` (${host})` : ''}. Check the project URL, that the project is not paused, your internet connection, and any ad blocker, VPN or firewall.`;
  }
  if (code === 'PGRST202' || code === '42P01' || /Could not find the function|schema cache|does not exist/i.test(msg)) {
    return 'The database is reachable, but supabase/schema.sql has not been run (or only partly). Run the whole file in the SQL Editor.';
  }
  if (code === '42501' || /permission denied|row-level security/i.test(msg)) {
    return 'The database refused access. Check that this account has a role in the app_users table (see the README).';
  }
  if (err?.status === 401 || /Invalid API key|No API key/i.test(msg)) {
    return 'The database rejected the key. Check that the URL and the publishable key come from the same Supabase project.';
  }
  return null;
}
