import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, 'src/public/build'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/client/main.jsx'), // 👈 nuevo path
      output: {
        entryFileNames: 'app.js',
        assetFileNames: 'app.[ext]'
      }
    }
  }
});