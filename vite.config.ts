import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  build: { chunkSizeWarningLimit: 800 },
  define: {
    __BUILD__: JSON.stringify(
      new Date().toLocaleString('en-GB', { timeZone: 'Asia/Shanghai', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    )
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg', 'fonts/*.woff2'],
      manifest: {
        name: 'HSK Basics',
        short_name: 'HSK Basics',
        description: 'Daily Mandarin practice: the 1,000 words of new HSK 1–3 and core grammar.',
        lang: 'en',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f5f5f7',
        theme_color: '#f5f5f7',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,json,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
      }
    })
  ]
})
