import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const plugins = [react()];

// `npm run dev:https` serves over HTTPS so a tablet/phone on your LAN can use
// the camera (browsers only allow camera access on HTTPS or localhost).
if (process.env.HTTPS === '1') {
  const ssl = (await import('@vitejs/plugin-basic-ssl')).default;
  plugins.push(ssl());
}

export default defineConfig({
  // Set VITE_BASE=/repo-name/ for GitHub Pages project sites (the workflow does this).
  base: process.env.VITE_BASE || '/',
  plugins,
  server: { host: true, port: 5173 }
});
