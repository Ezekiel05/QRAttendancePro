// Copies the face-api model weights from node_modules into public/models so
// Vite serves them (no download step needed beyond `npm install`).
import { cpSync, existsSync, mkdirSync } from 'node:fs';

const src = 'node_modules/@vladmandic/face-api/model';
const dest = 'public/models';

if (!existsSync(src)) {
  console.warn('[copy-models] face-api models not found yet - run `npm install` first.');
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
cpSync(src, dest, {
  recursive: true,
  filter: (file) => {
    const name = file.split('/').pop();
    return (
      name === 'model' ||
      /^(tiny_face_detector|face_landmark_68_model|face_recognition_model)/.test(name)
    );
  }
});
console.log('[copy-models] face models copied to public/models');
