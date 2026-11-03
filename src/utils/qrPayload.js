// Helpers for the QR Generator page. Pure functions, so they are easy to test.

// Maximum payload in bytes for a QR code at each error-correction level (version 40, byte mode).
export const QR_MAX_BYTES = { L: 2953, M: 2331, Q: 1663, H: 1273 };

export const byteLength = (text) => new TextEncoder().encode(String(text ?? '')).length;

// Wi-Fi join code understood by the iOS and Android camera apps:
//   WIFI:T:<WPA|WEP|nopass>;S:<ssid>;P:<password>;H:<true>;;
// The characters \ ; , : " must be escaped with a backslash.
const escapeWifi = (value) => String(value ?? '').replace(/([\\;,:"])/g, '\\$1');

export function wifiPayload({ ssid, password = '', security = 'WPA', hidden = false }) {
  if (!String(ssid ?? '').trim()) return '';
  const open = security === 'nopass';
  return (
    `WIFI:T:${open ? 'nopass' : security};S:${escapeWifi(ssid)};` +
    (open ? '' : `P:${escapeWifi(password)};`) +
    (hidden ? 'H:true;' : '') +
    ';'
  );
}

function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const channel = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

// WCAG-style contrast ratio between two #rrggbb colours (1 = identical, 21 = black on white).
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// True when the code is lighter than its background (inverted codes fail on many scanners).
export const isInverted = (fg, bg) => luminance(fg) > luminance(bg);

export function slugify(text, fallback = 'qr-code') {
  const slug = String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || fallback;
}

// "example.com/page" typed without a scheme: phones would treat it as plain text.
export function looksLikeBareDomain(text) {
  const t = String(text ?? '').trim();
  return /^[\w-]+(\.[\w-]+)*\.[a-z]{2,}(\/\S*)?$/i.test(t) && !/^[a-z][a-z0-9+.-]*:/i.test(t);
}
