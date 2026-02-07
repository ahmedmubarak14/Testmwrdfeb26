import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: './',
    server: {
      port: 5173,
      host: '0.0.0.0',
      allowedHosts: true,
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
                return 'vendor-react';
              }
              if (id.includes('/@supabase/')) {
                return 'vendor-supabase';
              }
              if (id.includes('/jspdf/') || id.includes('/html2canvas/')) {
                return 'vendor-docs';
              }
              if (id.includes('/i18next/') || id.includes('/react-i18next/')) {
                return 'vendor-i18n';
              }
              return 'vendor';
            }
          },
        },
      },
    },
    // Expose Supabase environment variables (VITE_ prefixed vars are automatically exposed)
    envPrefix: ['VITE_'],
  };
});
