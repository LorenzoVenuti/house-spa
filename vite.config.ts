import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify('1.1.3'),
  },
  plugins: [react()],
  server: { host: '0.0.0.0', port: 5174, strictPort: true },
});
