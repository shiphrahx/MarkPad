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
    // Sourcemaps are 2 MB against an 8 MB installer budget, so they only
    // ship in debug builds. Tauri sets TAURI_ENV_DEBUG for those.
    sourcemap: process.env.TAURI_ENV_DEBUG === 'true',
    rolldownOptions: {
      output: {
        // Without this, KaTeX ends up in two identical chunks because it is
        // reachable from both the editor's popovers and the export path. A
        // quarter of a megabyte of the same code twice.
        advancedChunks: {
          groups: [
            { name: 'katex', test: /[\/]node_modules[\/]katex[\/]/ },
          ],
        },
      },
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
})
