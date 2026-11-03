// Turns an uploaded picture into a small logo (a data URL) that is cheap to store
// with the settings and to sync between devices.

export function fitWithin(width, height, max) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// Approximate size of the decoded data inside a data URL.
export function dataUrlBytes(dataUrl) {
  const payload = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.floor((payload.length * 3) / 4) - padding;
}

// Browser only. Rejects with a message that is safe to show to the user.
export async function logoFromFile(file, { maxSize = 256, maxBytes = 90000 } = {}) {
  if (!file || !/^image\//.test(file.type)) {
    throw new Error('Choose an image file (PNG, JPG, WebP, GIF or SVG).');
  }
  if (file.size > 8 * 1024 * 1024) throw new Error('That image is over 8 MB. Choose a smaller one.');

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read that image.'));
      el.src = url;
    });
    const w = img.naturalWidth || img.width || maxSize;
    const h = img.naturalHeight || img.height || maxSize;

    let size = maxSize;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const dims = fitWithin(w, h, size);
      const canvas = document.createElement('canvas');
      canvas.width = dims.width;
      canvas.height = dims.height;
      canvas.getContext('2d').drawImage(img, 0, 0, dims.width, dims.height);
      // WebP keeps transparency and is small; browsers that cannot encode it fall back to PNG.
      let out = canvas.toDataURL('image/webp', 0.9);
      if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/png');
      if (dataUrlBytes(out) <= maxBytes) return out;
      size = Math.round(size * 0.75);
    }
    throw new Error('That image is too detailed to store as a logo. Try a simpler or smaller one.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
