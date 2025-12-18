import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/irs_forms_network/',
  plugins: [react()],
})

