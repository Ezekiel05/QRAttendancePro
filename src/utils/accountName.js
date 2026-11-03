// The name shown in the top bar for a signed-in account.
export const MAX_NAME = 40;

export const cleanDisplayName = (name) =>
  String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME);

// The chosen nickname, otherwise the part of the email before the @ (never the full address).
export function accountDisplayName(metadata, email) {
  const chosen = cleanDisplayName(metadata?.display_name);
  if (chosen) return chosen;
  const text = String(email ?? '');
  return text.split('@')[0] || text;
}
