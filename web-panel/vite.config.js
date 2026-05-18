import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  // file:// pages need relative asset URLs (not "/assets/...")
  base: './',
  plugins: [
    vue(),
    nodePolyfills({
      // Enable polyfills for specific globals and modules
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      // Enable polyfills for specific modules
      protocolImports: true,
    }),
    {
      name: 'wkwebview-classic-entry',
      transformIndexHtml(html) {
        // Single IIFE bundle; WKWebView often won't run type="module" on file://
        let out = html.replace(
          /<script type="module"[^>]*src="(\.\/)?assets\//g,
          '<script defer src="./assets/'
        )
        // file:// + crossorigin can block script/CSS in WKWebView (stuck on loading screen)
        out = out.replace(/\s+crossorigin(?:="[^"]*")?/g, '')
        return out
      }
    }
  ],
  root: '.',
  server: {
    port: 3000,
    host: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      stream: 'stream-browserify',
      path: 'path-browserify',
      fs: 'browserify-fs'
    }
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis'
      }
    }
  },
  // WKWebView (Sketch panel) loads the UI from file://; `<script type="module">`
  // often fails there. Emit a single classic script bundle instead.
  build: {
    target: 'es2018',
    modulePreload: false,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'assets/panel.js',
        chunkFileNames: 'assets/panel.js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  }
})
