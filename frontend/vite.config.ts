import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:8000' },
    // Lets a temporary Cloudflare quick tunnel serve the app to teammates on other networks.
    allowedHosts: ['.trycloudflare.com'],
  },
});
