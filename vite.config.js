import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Un punto de entrada por "isla" de React. El código que comparten (React)
// Vite lo separa en un chunk común: el navegador lo descarga una sola vez.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: path.resolve(import.meta.dirname, 'src/public/build'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        app: path.resolve(import.meta.dirname, 'src/client/main.jsx'),   // calendario
        goals: path.resolve(import.meta.dirname, 'src/client/goals.jsx') // objetivos
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: '[name].[ext]'
      }
    }
  }
});
