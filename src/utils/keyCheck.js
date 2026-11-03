// Tells the kinds of Supabase API key apart, so a SECRET key is never used in the browser.
//   publishable : sb_publishable_...   (new name for the anon key; safe in a web page)
//   anon        : legacy JWT with role "anon" (safe in a web page)
//   secret      : sb_secret_... or a legacy service_role JWT (bypasses every security rule!)
export function classifyKey(key) {
  const k = String(key ?? '').trim();
  if (!k) return 'empty';
  if (k.startsWith('sb_publishable_')) return 'publishable';
  if (k.startsWith('sb_secret_')) return 'secret';
  const parts = k.split('.');
  if (parts.length === 3) {
    try {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
      const role = JSON.parse(json).role;
      if (role === 'service_role') return 'secret';
      if (role === 'anon') return 'anon';
    } catch {
      /* not a readable JWT */
    }
  }
  return 'unknown';
}
