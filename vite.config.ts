import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { asxDataPlugin } from './server/asxDataPlugin.mjs'

export default defineConfig({
  plugins: [react(), tailwindcss(), asxDataPlugin()],
})
