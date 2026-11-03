// Reduces whatever was pasted as the Supabase URL to just its origin, e.g.
//   https://abc.supabase.co/rest/v1/  ->  https://abc.supabase.co
// The client library adds /rest/v1, /auth/v1 and /realtime/v1 itself, so a URL that
// already ends in one of them makes every request fail.
export function normalizeSupabaseUrl(raw) {
  let value = String(raw ?? '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .trim();
  if (!value) return '';
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}
