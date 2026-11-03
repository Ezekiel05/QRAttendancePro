import React, { useEffect, useRef, useState } from 'react';
import { useCamera } from '../utils/useCamera.js';
import { findMatch, loadFaceApi } from '../utils/face.js';
import { muted } from './ui.jsx';

const LOOP_MS = 250; // pause between detection passes
const FRAMES_REQUIRED = 3; // same person must be matched this many frames in a row
const COOLDOWN_MS = 5000; // pause after a successful match
const MIN_FACE_RATIO = 0.2; // face must fill at least 20% of the frame width

export default function FaceScanner({ employees, settings, onMatch }) {
  const { videoRef, error } = useCamera();
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [hint, setHint] = useState('Looking for a face…');

  // Keep the latest props available to the long-running loop without restarting it.
  const live = useRef({ employees, settings, onMatch });
  live.current = { employees, settings, onMatch };

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    let streak = { id: null, count: 0 };
    let cooldownUntil = 0;

    async function start() {
      let faceapi;
      try {
        faceapi = await loadFaceApi();
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setStatus('error');
          setHint('Could not load the face models. Stop the dev server and run `npm run dev` again.');
        }
        return;
      }
      if (cancelled) return;
      setStatus('ready');

      const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });

      const resetStreak = () => {
        streak = { id: null, count: 0 };
      };

      async function loop() {
        if (cancelled) return;
        const video = videoRef.current;

        if (video && video.readyState >= 2 && Date.now() >= cooldownUntil) {
          try {
            const faces = await faceapi
              .detectAllFaces(video, options)
              .withFaceLandmarks()
              .withFaceDescriptors();
            if (cancelled) return;

            if (faces.length === 0) {
              resetStreak();
              setHint('Looking for a face…');
            } else if (faces.length > 1) {
              resetStreak();
              setHint('One person at a time, please.');
            } else if (faces[0].detection.box.width / video.videoWidth < MIN_FACE_RATIO) {
              resetStreak();
              setHint('Move a little closer.');
            } else {
              const { employees: list, settings: cfg, onMatch: notify } = live.current;
              const result = findMatch(faces[0].descriptor, list, {
                threshold: Number(cfg.faceThreshold) || 0.45,
                margin: Number(cfg.faceMargin) || 0.08
              });

              if (result.match) {
                streak =
                  streak.id === result.match.id
                    ? { id: streak.id, count: streak.count + 1 }
                    : { id: result.match.id, count: 1 };
                setHint('Recognizing…');
                if (streak.count >= FRAMES_REQUIRED) {
                  notify(result.match);
                  cooldownUntil = Date.now() + COOLDOWN_MS;
                  resetStreak();
                  setHint('Looking for a face…');
                }
              } else {
                resetStreak();
                setHint(
                  result.reason === 'no-enrolled'
                    ? 'No faces are enrolled yet.'
                    : 'Face not recognized. Try again or use your QR badge.'
                );
              }
            }
          } catch (err) {
            console.error(err);
          }
        }

        if (!cancelled) timer = setTimeout(loop, LOOP_MS);
      }

      loop();
    }

    start();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [videoRef]);

  return (
    <div>
      <div className="overflow-hidden rounded-xl bg-slate-900">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="aspect-[4/3] w-full -scale-x-100 object-cover"
        />
      </div>
      {error && (
        <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {error}
        </div>
      )}
      <p className={`mt-3 text-center text-sm ${muted}`} aria-live="polite">
        {status === 'loading' ? 'Loading face models…' : hint}
      </p>
    </div>
  );
}
