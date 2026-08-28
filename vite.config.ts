import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { asxDataPlugin } from './server/asxDataPlugin.mjs'

export default defineConfig({
  plugins: [react(), tailwindcss(), asxDataPlugin()],
  server: {
    port: 5173,
    // Fall back to next free port if 5173 is occupied (kill stale vite on 5173 for the canonical URL).
    strictPort: false,
  },
})
