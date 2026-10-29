import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server runs on :5173 and talks to the C++ backend on :8080 directly
// (the backend allows this origin via CORS). See src/lib/api.js.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: false },
  build: {
    rollupOptions: {
      output: {
        // Keep the charting library out of the main bundle.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
        },
      },
    },
  },
});
