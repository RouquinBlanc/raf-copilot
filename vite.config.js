import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  // Set base to repo name for GitHub Pages deployment
  // Change 'raf-copilot' if your repo is named differently
  base: '/raf-copilot/',

  plugins: [
    // HTTPS for local dev — Chrome on Android requires HTTPS for geolocation
    basicSsl(),

    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'RAF Copilot',
        short_name: 'RAF Copilot',
        description: 'Points d\'intérêt pour la RAF 500K',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/raf-copilot/',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Cache all build assets with cache-first strategy
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        runtimeCaching: [
          {
            // Network-first for the app shell itself
            urlPattern: /\/raf-copilot\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-shell',
            },
          },
        ],
      },
    }),
  ],

  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
