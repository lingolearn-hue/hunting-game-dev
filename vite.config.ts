import { createHash } from 'node:crypto';
import { defineConfig, Plugin } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

const PUBLIC_FILES = ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];

/** Emits sw.js: precaches the app shell (cache-first) so the game works offline. */
function offlinePlugin(): Plugin {
  return {
    name: 'offline-sw',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle);
      const assets = ['./', 'index.html', ...files.filter((f) => f !== 'index.html'), ...PUBLIC_FILES];
      const version = createHash('sha1').update(files.join('|') + Date.now()).digest('hex').slice(0, 10); // new cache per build
      const source = `// generated
const CACHE = 'hg-${version}';
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith('hg-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('./') : Response.error()));
    }),
  );
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// HTTPS in dev is required for sensor APIs on phones.
// Build output goes to docs/ (GitHub Pages).
export default defineConfig(({ command }) => ({
  base: './',
  plugins: command === 'serve' ? [basicSsl()] : [offlinePlugin()],
  build: { outDir: 'docs', emptyOutDir: true },
}));
