import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// HTTPS in dev is required for sensor APIs on phones.
// Build output goes to docs/ (GitHub Pages).
export default defineConfig(({ command }) => ({
  base: './',
  plugins: command === 'serve' ? [basicSsl()] : [],
  build: { outDir: 'docs', emptyOutDir: true },
}));
