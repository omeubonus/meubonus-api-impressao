import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import pkg from './package.json';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const isProd = mode === 'production';

  return {
    plugins: [react()],
    base: './',
    root: path.resolve(__dirname, 'src/renderer'),
    define: {
      '__APP_VERSION__': JSON.stringify(pkg.version),
      '__APP_ENV__': JSON.stringify(env.VITE_APP_ENV || mode),
      '__HUB_URL__': JSON.stringify(
        env.VITE_HUB_URL || (mode === 'development' ? 'http://localhost:3335' : 'https://api-impressao.meubonus.com.br')
      ),
    },
    esbuild: isProd
      ? {
          drop: ['console', 'debugger'],
          legalComments: 'none',
        }
      : undefined,
    build: {
      outDir: path.resolve(__dirname, 'dist/renderer'),
      emptyOutDir: true,
      minify: isProd ? 'esbuild' : false,
      sourcemap: false,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
  };
});
