import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import FaceScanner from '../components/FaceScanner.jsx';
import { useData } from '../context/DataContext.jsx';
import { isPresentNow, recordDay, shiftFor, summarizeDay } from '../utils/attendance.js';
import { dateKey, fmtDuration, fmtTime, todayKey } from '../utils/time.js';
import { beep } from '../utils/sound.js';
import {
  btnPrimary,
  btnSecondary,
  cardCls,
  EventPill,
  inputCls,
  muted,
  Pill
} from '../components/ui.jsx';

const READER_ID = 'reader';

function ResultCard({ res }) {
  const { records, settings } = useData();

  if (!res.ok) {
    const messages = {
      unknown: ['QR code not recognized', 'Ask an admin to reissue your badge.'],
      inactive: ['Badge deactivated', 'Please contact an admin.'],
      'too-soon': ['Already scanned', `Please wait ${res.wait}s before scanning again.`],
      pending: ['Awaiting approval', 'Your registration has not been approved yet. Please see an admin.']
    };
    const [title, detail] = messages[res.reason] || ['Scan failed', ''];
    const tone =
      res.reason === 'too-soon' || res.reason === 'pending'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-red-200 bg-red-50 text-red-700';
    return (
      <div className={`rounded-2xl border p-6 ${tone}`}>
        <p className="text-xl font-bold">{title}</p>
        {res.employee && <p className="mt-1">{res.employee.name}</p>}
        <p className="mt-1 text-sm opacity-80">{detail}</p>
      </div>
    );
  }

  const { employee, record } = res;
  const isIn = record.type === 'in';
  const shiftName = (settings.shifts || []).find((s) => s.id === record.shiftId)?.name;
  let worked = null;
  if (!isIn) {
    const day = recordDay(record);
    const mine = records
      .filter((r) => r.employeeId === employee.id && recordDay(r) === day)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    worked = summarizeDay(mine).minutes;
  }

  return (
    <div
      className={`rounded-2xl border p-6 ${
        isIn
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
          : 'border-indigo-200 bg-indigo-50 text-indigo-900'
      }`}
    >
      <p className="break-words text-2xl font-bold sm:text-3xl">
        {isIn ? `Welcome, ${employee.name}` : `Goodbye, ${employee.name}`}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <EventPill type={record.type} status={record.status} />
        <span>{fmtTime(record.timestamp)}</span>
        <span className="opacity-60">{employee.employeeCode}</span>
        {shiftName && <span className="opacity-60">· {shiftName}</span>}
        {record.unscheduled && <Pill tone="amber">Not scheduled</Pill>}
      </div>
      {worked !== null && (
        <p className="mt-2 text-sm opacity-80">Time worked today: {fmtDuration(worked)}</p>
      )}
    </div>
  );
}

export default function Kiosk() {
  const { recordScan, settings, records, employees } = useData();
  const [now, setNow] = useState(new Date());
  const [cameras, setCameras] = useState([]);
  const [cameraId, setCameraId] = useState('');
  const [camError, setCamError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [method, setMethod] = useState('qr'); // 'qr' | 'face'
  const faceAvailable =
    settings.faceEnabled && employees.some((e) => e.active && e.faceDescriptors?.length);
  const activeMethod = faceAvailable ? method : 'qr';
  const [code, setCode] = useState('');
  const lastScan = useRef({ text: '', at: 0 });
  const clearTimer = useRef(null);

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  async function handleScan(text, source = 'qr') {
    if (source === 'qr' || source === 'face') {
      // Ignore the camera re-reading the same code in rapid succession.
      const l = lastScan.current;
      if (l.text === text && Date.now() - l.at < 4000) return;
      lastScan.current = { text, at: Date.now() };
    }
    const res = await recordScan(text, source);
    if (settings.soundEnabled) beep(res.ok);
    setResult({ ...res, at: Date.now() });
    clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setResult(null), 7000);
  }
  const handleScanRef = useRef(handleScan);
  handleScanRef.current = handleScan;

  // Discover cameras once
  useEffect(() => {
    Html5Qrcode.getCameras()
      .then((list) => {
        if (!list || list.length === 0) {
          setCamError('No camera found on this device.');
          return;
        }
        setCameras(list);
        const preferred = list.find((c) => /back|rear|environment/i.test(c.label));
        setCameraId((preferred || list[0]).id);
      })
      .catch(() =>
        setCamError('Camera unavailable. Allow camera access and use HTTPS or localhost.')
      );
    return () => clearTimeout(clearTimer.current);
  }, []);

  // Start / restart the scanner whenever the selected camera changes
  useEffect(() => {
    if (!cameraId || activeMethod !== 'qr') return undefined;
    const scanner = new Html5Qrcode(READER_ID);
    let stopped = false;

    const starting = scanner
      .start(
        cameraId,
        {
          fps: 10,
          // Scan area = 70% of the shorter video side, so it always fits small screens.
          qrbox: (w, h) => {
            const size = Math.max(120, Math.floor(Math.min(w, h) * 0.7));
            return { width: size, height: size };
          }
        },
        (text) => handleScanRef.current(text, 'qr'),
        () => {}
      )
      .then(() => {
        if (!stopped) {
          setScanning(true);
          setCamError('');
        }
      })
      .catch((err) => {
        console.error(err);
        if (!stopped) setCamError('Could not start the camera.');
      });

    return () => {
      stopped = true;
      setScanning(false);
      starting
        .then(() => scanner.stop())
        .then(() => scanner.clear())
        .catch(() => {});
    };
  }, [cameraId, activeMethod]);

  const today = todayKey();
  const signedIn = useMemo(
    () =>
      employees.filter(
        (e) => e.active && isPresentNow(records, e.id, new Date(), shiftFor(e, settings))
      ).length,
    [employees, records, settings]
  );
  const recent = useMemo(
    () => [...records].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 5),
    [records]
  );

  function submitCode(e) {
    e.preventDefault();
    if (!code.trim()) return;
    handleScan(code, 'manual');
    setCode('');
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 text-center">
        <p className="text-4xl font-extrabold tabular-nums sm:text-5xl">
          {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
        <p className={muted}>
          {now.toLocaleDateString([], {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
          })}
        </p>
        <div className="mt-2">
          <Pill tone="green">{signedIn} signed in now</Pill>
        </div>
      </div>

      {/* Result toast: floats over the page so it never shrinks the camera view. */}
      {result && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-4"
          role="status"
          aria-live="polite"
        >
          <div
            key={result.at}
            onClick={() => setResult(null)}
            className="toast-in pointer-events-auto w-full max-w-md cursor-pointer rounded-2xl shadow-2xl"
          >
            <ResultCard res={result} />
          </div>
        </div>
      )}

      {faceAvailable && (
        <div className="mb-4 flex justify-center gap-2">
          <button
            className={activeMethod === 'qr' ? btnPrimary : btnSecondary}
            onClick={() => setMethod('qr')}
          >
            QR code
          </button>
          <button
            className={activeMethod === 'face' ? btnPrimary : btnSecondary}
            onClick={() => setMethod('face')}
          >
            Face
          </button>
        </div>
      )}

      <div className={`${cardCls} p-5`}>
        {activeMethod === 'face' ? (
          <FaceScanner
            employees={employees}
            settings={settings}
            onMatch={(emp) => handleScanRef.current(emp.id, 'face')}
          />
        ) : (
          <>
            <div id={READER_ID} className="w-full overflow-hidden rounded-xl bg-slate-900" />

            {camError && (
              <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                {camError}
              </div>
            )}
            {scanning && (
              <p className={`mt-3 text-center text-xs ${muted}`}>
                Hold your badge's QR code up to the camera.
              </p>
            )}
            {cameras.length > 1 && (
              <select
                className={`${inputCls} mt-3`}
                value={cameraId}
                onChange={(e) => setCameraId(e.target.value)}
                aria-label="Select camera"
              >
                {cameras.map((c, i) => (
                  <option key={c.id} value={c.id}>
                    {c.label || `Camera ${i + 1}`}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
      </div>

      {settings.kioskManualEntry && (
        <form onSubmit={submitCode} className={`${cardCls} mt-6 flex gap-2 p-4`}>
          <input
            className={inputCls}
            placeholder="No badge? Enter employee code (EMP-0001)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button type="submit" className={btnPrimary}>
            Go
          </button>
        </form>
      )}

      <h2 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Recent scans
      </h2>
      <div className={`${cardCls} divide-y divide-slate-100 dark:divide-slate-700`}>
        {recent.length === 0 && (
          <p className={`px-4 py-5 text-center text-sm ${muted}`}>No scans yet.</p>
        )}
        {recent.map((r) => (
          <div key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="font-medium">{r.employeeName}</span>
            <span className="flex items-center gap-3">
              <EventPill type={r.type} status={r.status} />
              <span className={muted}>{fmtTime(r.timestamp)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
