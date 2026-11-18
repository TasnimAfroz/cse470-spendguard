import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server forwards /api/* to the NestJS backend, so the browser talks to one origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
