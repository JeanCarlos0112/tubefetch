import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Configure the output directory for the renderer process build.
  // This directory needs to be accessible by the Electron main process
  // when loading your application in a production build.
  // We'll place it in a separate directory like '.vite/renderer'
  // to distinguish it from the Webpack build output if you keep it.
  build: {
    outDir: path.join(__dirname, '.vite/renderer'),
    emptyOutDir: true, // Clean the output directory before building
  },
  // Define the base public path if needed.
  // For Electron, './' is often necessary for correct asset loading in production.
  base: './',
});
