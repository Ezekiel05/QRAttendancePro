import React, { useRef, useState } from 'react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { btnPrimary, btnSecondary, cardCls, inputCls, muted, PageHeader } from '../components/ui.jsx';
import {
  QR_MAX_BYTES,
  byteLength,
  contrastRatio,
  isInverted,
  looksLikeBareDomain,
  slugify,
  wifiPayload
} from '../utils/qrPayload.js';

const LEVELS = [
  ['L', 'Low (7% repair)'],
  ['M', 'Medium (15%)'],
  ['Q', 'Quartile (25%)'],
  ['H', 'High (30%)']
];

// Links to this site's own pages (works under a sub-path such as GitHub Pages).
const appLink = (path) => `${window.location.origin}${import.meta.env.BASE_URL}${path}`;
const PRESETS = [
  { label: 'Signup page', value: () => appLink('signup') },
  { label: 'Kiosk page', value: () => appLink('scan') },
  { label: 'App home', value: () => appLink('') }
];

const escapeXml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// QR canvas + optional caption underneath, at the canvas's full resolution.
function composePng(qrCanvas, size, caption, fg, bg) {
  const f = qrCanvas.width / size;
  const captionHeight = caption ? Math.round(44 * f) : 0;
  const out = document.createElement('canvas');
  out.width = qrCanvas.width;
  out.height = qrCanvas.height + captionHeight;
  const g = out.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, out.width, out.height);
  g.drawImage(qrCanvas, 0, 0);
  if (caption) {
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `600 ${Math.round(20 * f)}px sans-serif`;
    g.fillText(caption, out.width / 2, qrCanvas.height + captionHeight / 2, out.width * 0.92);
  }
  return out;
}

function buildSvg(svgEl, size, caption, fg, bg) {
  const captionHeight = caption ? 44 : 0;
  const text = caption
    ? `<text x="${size / 2}" y="${size + captionHeight / 2}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="20" font-weight="600" fill="${fg}">${escapeXml(caption)}</text>`
    : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + captionHeight}" ` +
    `viewBox="0 0 ${size} ${size + captionHeight}"><rect width="100%" height="100%" fill="${bg}"/>` +
    `${svgEl.outerHTML}${text}</svg>`
  );
}

export default function QrGenerator() {
  const [mode, setMode] = useState('text'); // 'text' | 'wifi'
  const [text, setText] = useState('');
  const [wifi, setWifi] = useState({ ssid: '', password: '', security: 'WPA', hidden: false });
  const [size, setSize] = useState(320);
  const [level, setLevel] = useState('M');
  const [margin, setMargin] = useState(true);
  const [fg, setFg] = useState('#000000');
  const [bg, setBg] = useState('#ffffff');
  const [caption, setCaption] = useState('');
  const [msg, setMsg] = useState('');
  const [printUrl, setPrintUrl] = useState('');
  const canvasWrap = useRef(null);
  const svgWrap = useRef(null);

  const payload = mode === 'wifi' ? wifiPayload(wifi) : text;
  const bytes = byteLength(payload);
  const tooLong = bytes > QR_MAX_BYTES[level];
  const ready = payload.trim() !== '' && !tooLong;
  const lowContrast = contrastRatio(fg, bg) < 3;
  const inverted = isInverted(fg, bg);
  const note = caption.trim();
  const fileBase = slugify(note || (mode === 'wifi' ? `wifi-${wifi.ssid}` : text.slice(0, 30)));

  const flash = (t) => {
    setMsg(t);
    setTimeout(() => setMsg(''), 3000);
  };
  const getCanvas = () => canvasWrap.current?.querySelector('canvas');
  const setWifiField = (k) => (e) =>
    setWifi((w) => ({ ...w, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  function downloadPng() {
    const c = getCanvas();
    if (!c) return;
    composePng(c, size, note, fg, bg).toBlob((b) => b && triggerDownload(b, `${fileBase}.png`), 'image/png');
  }

  function downloadSvg() {
    const el = svgWrap.current?.querySelector('svg');
    if (!el) return;
    triggerDownload(new Blob([buildSvg(el, size, note, fg, bg)], { type: 'image/svg+xml' }), `${fileBase}.svg`);
  }

  async function copyImage() {
    try {
      const c = getCanvas();
      const blob = await new Promise((resolve) => composePng(c, size, note, fg, bg).toBlob(resolve, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      flash('Copied to the clipboard.');
    } catch {
      flash('Copying images is not supported here. Use Download instead.');
    }
  }

  function print() {
    const c = getCanvas();
    if (!c) return;
    setPrintUrl(composePng(c, size, note, fg, bg).toDataURL('image/png'));
    setTimeout(() => window.print(), 100);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="no-print">
        <PageHeader
          title="QR Generator"
          subtitle="Make a QR code for a link, text or Wi-Fi network. Everything is created in your browser."
        />

        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <div className={`${cardCls} space-y-5 p-5`}>
            <div className="flex gap-2">
              <button
                className={mode === 'text' ? btnPrimary : btnSecondary}
                onClick={() => setMode('text')}
              >
                Link or text
              </button>
              <button
                className={mode === 'wifi' ? btnPrimary : btnSecondary}
                onClick={() => setMode('wifi')}
              >
                Wi-Fi
              </button>
            </div>

            {mode === 'text' ? (
              <div>
                <label className="mb-1 block text-sm font-medium">Link or text</label>
                <textarea
                  className={inputCls}
                  rows={3}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="https://example.com or any text"
                />
                {looksLikeBareDomain(text) && (
                  <p className={`mt-1 text-xs ${muted}`}>
                    Phones may treat this as plain text.{' '}
                    <button
                      className="font-medium text-indigo-600 dark:text-indigo-400"
                      onClick={() => setText(`https://${text.trim()}`)}
                    >
                      Add https://
                    </button>
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className={`text-xs ${muted}`}>This site:</span>
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                      onClick={() => setText(p.value())}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <p className={`mt-1 text-xs ${muted}`}>
                  The signup link only works when self-signup is enabled in Settings.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">Network name (SSID)</label>
                  <input className={inputCls} value={wifi.ssid} onChange={setWifiField('ssid')} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium">Security</label>
                    <select className={inputCls} value={wifi.security} onChange={setWifiField('security')}>
                      <option value="WPA">WPA / WPA2 / WPA3</option>
                      <option value="WEP">WEP</option>
                      <option value="nopass">None (open)</option>
                    </select>
                  </div>
                  {wifi.security !== 'nopass' && (
                    <div>
                      <label className="mb-1 block text-sm font-medium">Password</label>
                      <input className={inputCls} value={wifi.password} onChange={setWifiField('password')} />
                    </div>
                  )}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={wifi.hidden} onChange={setWifiField('hidden')} />
                  Hidden network
                </label>
                <p className={`text-xs ${muted}`}>
                  The password is stored inside the code: anyone who can scan it can join the network.
                </p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Size: {size}px</label>
                <input
                  type="range"
                  min="128"
                  max="1024"
                  step="32"
                  value={size}
                  onChange={(e) => setSize(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Error correction</label>
                <select className={inputCls} value={level} onChange={(e) => setLevel(e.target.value)}>
                  {LEVELS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Code colour</label>
                <input
                  type="color"
                  value={fg}
                  onChange={(e) => setFg(e.target.value)}
                  className="h-10 w-16 cursor-pointer rounded border border-slate-300 bg-transparent dark:border-slate-600"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Background</label>
                <input
                  type="color"
                  value={bg}
                  onChange={(e) => setBg(e.target.value)}
                  className="h-10 w-16 cursor-pointer rounded border border-slate-300 bg-transparent dark:border-slate-600"
                />
              </div>
              <button
                className={btnSecondary}
                onClick={() => {
                  setFg(bg);
                  setBg(fg);
                }}
              >
                Swap
              </button>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input type="checkbox" checked={margin} onChange={(e) => setMargin(e.target.checked)} />
                White border
              </label>
            </div>
            {(lowContrast || inverted) && (
              <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                {lowContrast
                  ? 'Low contrast: this code may not scan. Use a dark code on a light background.'
                  : 'Light-on-dark codes do not scan on some readers. Dark on light is the safest.'}
              </p>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium">Caption (optional)</label>
              <input
                className={inputCls}
                value={caption}
                maxLength={60}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Printed under the code, e.g. Scan to sign up"
              />
            </div>
          </div>

          <div className={`${cardCls} self-start p-5 lg:sticky lg:top-20`}>
            <h2 className="mb-3 font-semibold">Preview</h2>
            <div className="rounded-xl p-3" style={{ background: bg }}>
              <div ref={canvasWrap} className="flex justify-center">
                {ready ? (
                  <QRCodeCanvas
                    value={payload}
                    size={size}
                    level={level}
                    bgColor={bg}
                    fgColor={fg}
                    includeMargin={margin}
                    style={{ width: '100%', height: 'auto', maxWidth: size }}
                  />
                ) : (
                  <div
                    className="flex aspect-square w-full max-w-[16rem] items-center justify-center text-center text-sm"
                    style={{ color: fg }}
                  >
                    {tooLong ? 'Too much text for this error-correction level.' : 'Your QR code appears here.'}
                  </div>
                )}
              </div>
              {ready && note && (
                <p className="mt-2 break-words text-center font-semibold" style={{ color: fg }}>
                  {note}
                </p>
              )}
            </div>
            {tooLong && (
              <p className="mt-2 text-sm text-red-600">
                {bytes} bytes is over the {QR_MAX_BYTES[level]}-byte limit. Shorten it or pick lower error
                correction.
              </p>
            )}
            {ready && <p className={`mt-2 text-xs ${muted}`}>{bytes} bytes</p>}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button className={btnPrimary} onClick={downloadPng} disabled={!ready}>
                Download PNG
              </button>
              <button className={btnPrimary} onClick={downloadSvg} disabled={!ready}>
                Download SVG
              </button>
              <button className={btnSecondary} onClick={copyImage} disabled={!ready}>
                Copy image
              </button>
              <button className={btnSecondary} onClick={print} disabled={!ready}>
                Print
              </button>
            </div>
            {msg && <p className="mt-2 text-sm text-emerald-600">{msg}</p>}
          </div>
        </div>

        {ready && (
          <div ref={svgWrap} className="hidden">
            <QRCodeSVG
              value={payload}
              size={size}
              level={level}
              bgColor={bg}
              fgColor={fg}
              includeMargin={margin}
            />
          </div>
        )}
      </div>

      {printUrl && (
        <div className="hidden print:block">
          <img src={printUrl} alt="QR code" className="mx-auto max-w-full" />
        </div>
      )}
    </div>
  );
}
