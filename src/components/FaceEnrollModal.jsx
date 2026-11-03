import React, { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import { btnDanger, btnPrimary, btnSecondary, muted } from './ui.jsx';
import { useCamera } from '../utils/useCamera.js';
import { distance, loadFaceApi, toStored } from '../utils/face.js';

const MIN_SAMPLES = 3;
const MAX_SAMPLES = 5;

export default function FaceEnrollModal({ employee, employees, matchThreshold, onSave, onClose }) {
  const { videoRef, error } = useCamera();
  const [faceapi, setFaceapi] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [samples, setSamples] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [consent, setConsent] = useState(Boolean(employee.faceConsentAt));
  const enrolledCount = employee.faceDescriptors?.length || 0;

  useEffect(() => {
    let cancelled = false;
    loadFaceApi()
      .then((api) => !cancelled && setFaceapi(api))
      .catch(() => !cancelled && setLoadError('Could not load the face models. Restart `npm run dev`.'));
    return () => {
      cancelled = true;
    };
  }, []);

  async function capture() {
    if (!faceapi || busy || !videoRef.current) return;
    setBusy(true);
    setMsg('');
    try {
      const faces = await faceapi
        .detectAllFaces(
          videoRef.current,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.6 })
        )
        .withFaceLandmarks()
        .withFaceDescriptors();

      if (faces.length === 0) {
        setMsg('No face detected. Face the camera in good, even light.');
        return;
      }
      if (faces.length > 1) {
        setMsg('More than one face in view. Only the employee should be visible.');
        return;
      }

      const d = toStored(faces[0].descriptor);

      // Refuse faces that look like another enrolled employee (would cause mismatches).
      for (const other of employees) {
        if (other.id === employee.id || !other.faceDescriptors?.length) continue;
        const closest = Math.min(...other.faceDescriptors.map((x) => distance(x, d)));
        if (closest < matchThreshold + 0.05) {
          setMsg(`This face is too similar to ${other.name}'s enrolled face.`);
          return;
        }
      }
      // Refuse samples that look like a different person than earlier samples.
      if (samples.length && Math.min(...samples.map((s) => distance(s, d))) > 0.55) {
        setMsg('That does not look like the same person as the earlier samples. Retake.');
        return;
      }

      setSamples((s) => [...s, d]);
      setMsg('Captured. Turn your head slightly between samples.');
    } catch (err) {
      console.error(err);
      setMsg('Capture failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function save() {
    onSave({
      faceDescriptors: samples,
      faceEnrolledAt: new Date().toISOString(),
      faceConsentAt: employee.faceConsentAt || new Date().toISOString()
    });
  }

  function remove() {
    if (window.confirm(`Delete ${employee.name}'s face data?`)) {
      onSave({ faceDescriptors: [], faceEnrolledAt: null, faceConsentAt: null });
    }
  }

  return (
    <Modal title={`Face enrollment · ${employee.name}`} onClose={onClose} wide>
      <div className="overflow-hidden rounded-xl bg-slate-900">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="aspect-[4/3] w-full -scale-x-100 object-cover"
        />
      </div>
      {(error || loadError) && (
        <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {error || loadError}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-sm">
          <span className="font-medium">
            {samples.length}/{MAX_SAMPLES} samples
          </span>
          <span className={muted}> · need at least {MIN_SAMPLES}</span>
          {enrolledCount > 0 && samples.length === 0 && (
            <div className={`text-xs ${muted}`}>
              Currently enrolled with {enrolledCount} samples. Capturing new ones replaces them.
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button className={btnSecondary} onClick={() => setSamples([])} disabled={!samples.length}>
            Reset
          </button>
          <button
            className={btnPrimary}
            onClick={capture}
            disabled={!faceapi || busy || samples.length >= MAX_SAMPLES}
          >
            {!faceapi ? 'Loading…' : busy ? 'Checking…' : 'Capture sample'}
          </button>
        </div>
      </div>
      {msg && <p className={`mt-2 text-sm ${muted}`}>{msg}</p>}

      <label className="mt-4 flex items-start gap-2 text-sm">
        <input
          className="mt-1"
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          disabled={Boolean(employee.faceConsentAt)}
        />
        <span>
          This employee has given written consent to biometric (face) enrollment for attendance.
          {employee.faceConsentAt && (
            <span className={`block text-xs ${muted}`}>
              Consent recorded {new Date(employee.faceConsentAt).toLocaleDateString()}.
            </span>
          )}
        </span>
      </label>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          className={`${btnPrimary} flex-1`}
          onClick={save}
          disabled={samples.length < MIN_SAMPLES || !consent}
        >
          Save face data
        </button>
        {enrolledCount > 0 && (
          <button className={btnDanger} onClick={remove}>
            Remove face data
          </button>
        )}
        <button className={btnSecondary} onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
