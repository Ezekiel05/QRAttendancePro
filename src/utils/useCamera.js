import { useEffect, useRef, useState } from 'react';

// Opens the front camera into a <video ref={videoRef}> and stops it on unmount.
export function useCamera() {
  const videoRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let stream = null;
    let cancelled = false;

    // Small delay so a previous camera user (e.g. the QR scanner) can release the device.
    const timer = setTimeout(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        if (!cancelled) {
          setError('Camera unavailable. Allow camera access and use HTTPS or localhost.');
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (stream) stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return { videoRef, error };
}
