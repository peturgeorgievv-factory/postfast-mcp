import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The calendar view as one self-contained HTML file (dist/view/index.html):
// scripts, styles and icons inline, nothing loaded from elsewhere.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  logLevel: 'warn',
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    outDir: fileURLToPath(new URL('../dist/view', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
    reportCompressedSize: false,
  },
});
