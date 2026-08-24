import { defineConfig } from 'vite'

// Tauri drives the dev server, so the port is fixed and failing loudly is
// better than silently moving to 1421 where the Rust side isn't looking.
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  // Tauri targets a known WebView on each platform, so there's no reason to
  // ship transpiled output for browsers nobody will run this in.
  build: {
    target: process.platform === 'darwin' ? 'safari15' : 'chrome110',
    sourcemap: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
})
