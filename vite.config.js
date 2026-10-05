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
        goals: path.resolve(import.meta.dirname, 'src/client/goals.jsx'), // objetivos
        trackers: path.resolve(import.meta.dirname, 'src/client/trackers.jsx'), // seguimientos
        groups: path.resolve(import.meta.dirname, 'src/client/groups.jsx'), // grupos
        home: path.resolve(import.meta.dirname, 'src/client/home.jsx'), // inicio: la card del día
        week: path.resolve(import.meta.dirname, 'src/client/week.jsx') // Mi semana
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: '[name].[ext]'
      }
    }
  }
});
