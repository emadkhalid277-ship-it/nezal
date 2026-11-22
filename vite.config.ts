import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        devOptions: {
          enabled: true,
          type: 'module',
        },
        manifest: {
          id: '/',
          name: 'نِزال — لعبة التحدي الجماعي',
          short_name: 'نِزال',
          description:
            'منصة التحدي الجماعي للفرق — العب محلياً دون إنترنت أو عن بُعد عبر الإنترنت.',
          theme_color: '#14543D',
          background_color: '#F3F5E9',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          lang: 'ar',
          dir: 'rtl',
          orientation: 'any',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/__\//],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'nizal-google-fonts-css',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'nizal-google-fonts-files',
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              // Cache ONLY public Storage / image media GET requests; NEVER cache Auth or Firestore user APIs
              urlPattern: ({url, request}) => {
                if (request.method !== 'GET') return false;
                if (
                  url.hostname.includes('identitytoolkit.googleapis.com') ||
                  url.hostname.includes('securetoken.googleapis.com') ||
                  url.hostname.includes('firestore.googleapis.com') ||
                  url.hostname.includes('firebaseinstallations.googleapis.com')
                ) {
                  return false;
                }
                const isStorageMedia =
                  url.hostname.includes('firebasestorage.googleapis.com') ||
                  url.hostname.includes('storage.googleapis.com') ||
                  url.hostname.includes('res.cloudinary.com');
                const isImageExt = /\.(png|jpg|jpeg|webp|gif|svg)(\?.*)?$/i.test(
                  url.pathname
                );
                return isStorageMedia || (url.origin !== self.location.origin && isImageExt);
              },
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'nizal-offline-media-v1',
                expiration: {
                  maxEntries: 500,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('src/data/categoriesAndSeed')) return 'categories-seed';
            if (id.includes('src/data/questions')) return 'questions-data';
            if (id.includes('node_modules')) {
              if (id.includes('firebase')) return 'vendor-firebase';
              if (id.includes('lucide-react')) return 'vendor-lucide';
              if (id.includes('motion')) return 'vendor-motion';
              if (id.includes('canvas-confetti')) return 'vendor-confetti';
              return 'vendor-core';
            }
          },
        },
      },
    },
  };
});
