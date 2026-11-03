import React, { useEffect, useState } from 'react';
import { useData } from '../context/DataContext.jsx';
import { useCamera } from '../utils/useCamera.js';
import { distance, loadFaceApi, toStored } from '../utils/face.js';
import BadgeCard from '../components/BadgeCard.jsx';
import BadgeDownloadButton from '../components/BadgeDownloadButton.jsx';
import { btnPrimary, btnSecondary, cardCls, inputCls, muted } from '../components/ui.jsx';

const MIN_SAMPLES = 3;

// Small JPEG thumbnail (kept only so an admin can verify who signed up).
function snapshot(video) {
  const w = 200;
  const h = Math.round((w * video.videoHeight) / video.videoWidth);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(video, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.6);
}

function CaptureStep({ faceRequired, employees, threshold, onBack, onComplete }) {
  const { videoRef, error } = useCamera();
  const [faceapi, setFaceapi] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [samples, setSamples] = useState([]);
  const [photo, setPhoto] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!faceRequired) return undefined;
    let cancelled = false;
    loadFaceApi()
      .then((api) => !cancelled && setFaceapi(api))
      .catch(() => !cancelled && setLoadError('Could not load face models. Please ask an admin.'));
    return () => {
      cancelled = true;
    };
  }, [faceRequired]);

  async function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || busy) return;
    setMsg('');

    if (!faceRequired) {
      setPhoto(snapshot(video));
      return;
    }
    if (!faceapi) return;

    setBusy(true);
    try {
      const faces = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.6 }))
        .withFaceLandmarks()
        .withFaceDescriptors();

      if (faces.length === 0) {
        setMsg('No face detected. Face the camera in good, even light.');
        return;
      }
      if (faces.length > 1) {
        setMsg('Only one person should be in view.');
        return;
      }
      const d = toStored(faces[0].descriptor);

      // Don't reveal who: just refuse faces that already belong to an enrolled employee.
      for (const other of employees) {
        if (!other.faceDescriptors?.length) continue;
        if (Math.min(...other.faceDescriptors.map((x) => distance(x, d))) < threshold + 0.05) {
          setMsg('This face is already registered. Please see an admin.');
          return;
        }
      }
      if (samples.length && Math.min(...samples.map((s) => distance(s, d))) > 0.55) {
        setMsg('That does not look like the same person as your earlier captures. Retake.');
        return;
      }

      if (!photo) setPhoto(snapshot(video));
      setSamples((s) => [...s, d]);
      setMsg('Captured. Turn your head slightly between captures.');
    } catch (err) {
      console.error(err);
      setMsg('Capture failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const ready = faceRequired ? samples.length >= MIN_SAMPLES : Boolean(photo);

  return (
    <div className={`${cardCls} p-6`}>
      <h2 className="mb-1 text-lg font-bold">Take your photo</h2>
      <p className={`mb-4 text-sm ${muted}`}>
        {faceRequired
          ? `Capture ${MIN_SAMPLES} photos, turning your head slightly each time. This sets up face sign-in.`
          : 'An admin uses this photo to confirm who you are.'}
      </p>

      <div className="relative overflow-hidden rounded-xl bg-slate-900">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="aspect-[4/3] w-full -scale-x-100 object-cover"
        />
        {photo && !faceRequired && (
          <img src={photo} alt="Your photo" className="absolute inset-0 h-full w-full object-cover" />
        )}
      </div>

      {(error || loadError) && (
        <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {error || loadError}
        </div>
      )}
      {msg && <p className={`mt-3 text-sm ${muted}`}>{msg}</p>}
      {faceRequired && (
        <p className="mt-3 text-sm font-medium">
          {samples.length}/{MIN_SAMPLES} captured
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className={btnPrimary}
          onClick={capture}
          disabled={busy || (faceRequired && (!faceapi || samples.length >= MIN_SAMPLES))}
        >
          {faceRequired
            ? !faceapi
              ? 'Loading…'
              : busy
              ? 'Checking…'
              : 'Capture'
            : photo
            ? 'Retake'
            : 'Take photo'}
        </button>
        {faceRequired && samples.length > 0 && (
          <button
            className={btnSecondary}
            onClick={() => {
              setSamples([]);
              setPhoto('');
              setMsg('');
            }}
          >
            Start over
          </button>
        )}
        <button className={btnSecondary} onClick={onBack}>
          Back
        </button>
        <button
          className={`${btnPrimary} ml-auto`}
          disabled={!ready}
          onClick={() => onComplete({ photo, faceDescriptors: faceRequired ? samples : [] })}
        >
          Submit registration
        </button>
      </div>
    </div>
  );
}

export default function Signup() {
  const { settings, employees, submitSignup } = useData();
  const [step, setStep] = useState('form'); // 'form' | 'capture' | 'done'
  const [form, setForm] = useState({
    name: '',
    position: '',
    department: '',
    email: '',
    code: '',
    consent: false
  });
  const [error, setError] = useState('');
  const [registration, setRegistration] = useState(null);

  const faceRequired = Boolean(settings.faceEnabled);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  if (!settings.selfSignupEnabled && step !== 'done') {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="mb-2 text-xl font-bold">Signup is closed</h1>
        <p className={muted}>Please ask an admin to register you.</p>
      </div>
    );
  }

  function goCapture(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Enter your name.');
    if (settings.signupCode && form.code.trim() !== settings.signupCode) {
      return setError('Incorrect signup code.');
    }
    if (!form.consent) return setError('You need to agree before continuing.');
    setStep('capture');
  }

  async function finish({ photo, faceDescriptors }) {
    const res = await submitSignup({ ...form, photo, faceDescriptors });
    if (!res.ok) {
      setError(res.error);
      setStep('form');
      return;
    }
    setRegistration(res.registration);
    setStep('done');
  }

  if (step === 'done' && registration) {
    const badgeEmployee = {
      name: registration.name,
      position: registration.position,
      department: registration.department,
      employeeCode: 'PENDING APPROVAL',
      badgeToken: registration.badgeToken
    };
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <h1 className="mb-2 text-2xl font-bold">You're registered</h1>
        <p className={`mb-6 ${muted}`}>
          Save your QR badge below. It starts working once an admin approves your registration.
        </p>
        <div className="mb-6 flex justify-center">
          <BadgeCard employee={badgeEmployee} company={settings.companyName} logo={settings.logo} />
        </div>
        <BadgeDownloadButton
          employee={badgeEmployee}
          company={settings.companyName}
          logo={settings.logo}
          className={btnPrimary}
        >
          Download QR badge
        </BadgeDownloadButton>
        <p className={`mt-5 text-xs ${muted}`}>
          Download it now: this page will not show it again (an admin can reissue it if lost). Anyone
          with this QR can sign in as you, so keep it private.
        </p>
      </div>
    );
  }

  if (step === 'capture') {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <CaptureStep
          faceRequired={faceRequired}
          employees={employees}
          threshold={Number(settings.faceThreshold) || 0.45}
          onBack={() => setStep('form')}
          onComplete={finish}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <form onSubmit={goCapture} className={`${cardCls} p-6`}>
        {settings.logo && (
          <img src={settings.logo} alt="" className="mx-auto mb-4 h-16 w-16 object-contain" />
        )}
        <h1 className="mb-1 text-xl font-bold">Employee signup</h1>
        <p className={`mb-5 text-sm ${muted}`}>
          Register to get your personal QR badge. An admin will approve it.
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Full name *</label>
            <input className={inputCls} value={form.name} onChange={set('name')} autoFocus required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Position</label>
              <input className={inputCls} value={form.position} onChange={set('position')} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Department</label>
              <input className={inputCls} value={form.department} onChange={set('department')} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <input type="email" className={inputCls} value={form.email} onChange={set('email')} />
          </div>
          {(settings.signupCode || settings.signupCodeRequired) && (
            <div>
              <label className="mb-1 block text-sm font-medium">Signup code *</label>
              <input className={inputCls} value={form.code} onChange={set('code')} required />
            </div>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input
              className="mt-1"
              type="checkbox"
              checked={form.consent}
              onChange={(e) => setForm((f) => ({ ...f, consent: e.target.checked }))}
            />
            <span>
              I agree that my name, work details and photo
              {faceRequired ? ' and face data' : ''} are collected and used only for attendance at{' '}
              {settings.companyName}, and I can ask for them to be deleted.
            </span>
          </label>
        </div>

        <button type="submit" className={`${btnPrimary} mt-6 w-full py-2.5`}>
          Next: take photo
        </button>
      </form>
    </div>
  );
}
