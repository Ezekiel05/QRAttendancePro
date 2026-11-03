const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export function randomHex(byteCount = 16) {
  const bytes = new Uint8Array(byteCount);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export const uid = () => randomHex(8);

// PBKDF2-SHA256 (100k iterations) via WebCrypto.
// crypto.subtle only exists on HTTPS or localhost.
export async function hashPassword(password, salt) {
  if (!crypto.subtle) {
    throw new Error('Admin sign-in needs HTTPS or localhost (secure context).');
  }
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits'
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    key,
    256
  );
  return toHex(new Uint8Array(bits));
}
