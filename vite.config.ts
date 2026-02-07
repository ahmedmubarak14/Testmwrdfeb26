import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: '/',
    server: {
      port: 5173,
      host: '0.0.0.0',
      allowedHosts: true,
    },
    plugins: [
      react(),
      {
        name: 'strip-crossorigin-from-generated-assets',
        transformIndexHtml(html) {
          // Prevent browsers from treating same-origin bundle files as CORS requests.
          return html.replace(/\s+crossorigin(?=(\s|>))/g, '');
        },
      },
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    // Expose Supabase environment variables (VITE_ prefixed vars are automatically exposed)
    envPrefix: ['VITE_'],
  };
});
