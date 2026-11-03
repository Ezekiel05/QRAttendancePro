// Face recognition helpers built on @vladmandic/face-api (runs fully in the browser).
// Faces are reduced to 128-number descriptors; photos are never stored.

let apiPromise = null;

// Lazy-loads the library + models the first time face features are used,
// so the QR-only flow doesn't pay the download cost.
export function loadFaceApi() {
  if (!apiPromise) {
    apiPromise = (async () => {
      const faceapi = await import('@vladmandic/face-api');
      const url = `${import.meta.env.BASE_URL}models`;
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(url),
        faceapi.nets.faceLandmark68Net.loadFromUri(url),
        faceapi.nets.faceRecognitionNet.loadFromUri(url)
      ]);
      return faceapi;
    })().catch((err) => {
      apiPromise = null; // allow a retry
      throw err;
    });
  }
  return apiPromise;
}

export const toStored = (descriptor) => Array.from(descriptor, (x) => Math.round(x * 1e4) / 1e4);

export function distance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

// 1:N search. A match must be under `threshold` AND clearly better than the
// runner-up (`margin`), which cuts down look-alike mismatches.
export function findMatch(descriptor, employees, { threshold, margin }) {
  const scored = [];
  for (const employee of employees) {
    if (!employee.active || !employee.faceDescriptors?.length) continue;
    let best = Infinity;
    for (const d of employee.faceDescriptors) {
      const dist = distance(descriptor, d);
      if (dist < best) best = dist;
    }
    scored.push({ employee, distance: best });
  }
  if (scored.length === 0) return { match: null, reason: 'no-enrolled' };

  scored.sort((a, b) => a.distance - b.distance);
  const [best, second] = scored;
  if (best.distance > threshold) return { match: null, reason: 'no-match' };
  if (second && second.distance - best.distance < margin) return { match: null, reason: 'ambiguous' };
  return { match: best.employee, distance: best.distance };
}
