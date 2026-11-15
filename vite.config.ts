import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Relative base + HashRouter means the build works at any GitHub Pages path.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'SportsScoresbyZim',
        short_name: 'Scores',
        description: 'Live NFL scores, box scores, play-by-play and standings.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#0f1411',
        theme_color: '#203731',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Live data: always try the network, fall back to the last copy when offline.
            urlPattern: /^https:\/\/(site|site\.web|sports\.core)\.api\.espn\.com\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'espn-data',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 300, maxAgeSeconds: 7 * 24 * 3600 },
            },
          },
          {
            urlPattern: /^https:\/\/a\.espncdn\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'espn-images',
              expiration: { maxEntries: 600, maxAgeSeconds: 30 * 24 * 3600 },
            },
          },
        ],
      },
    }),
  ],
  test: { environment: 'node' },
});
