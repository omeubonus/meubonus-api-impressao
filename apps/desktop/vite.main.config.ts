import { defineConfig, loadEnv } from 'vite';
import path from 'path';
import pkg from './package.json';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const isProd = mode === 'production';

  return {
    define: {
      'process.env.APP_ENV': JSON.stringify(env.VITE_APP_ENV || mode),
      'process.env.HUB_URL': JSON.stringify(
        env.VITE_HUB_URL || (mode === 'development' ? 'http://localhost:3335' : 'https://api-impressao.meubonus.com.br')
      ),
      'process.env.APP_NAME': JSON.stringify(env.VITE_APP_NAME || 'SilentPrint Agent'),
      'process.env.APP_VERSION': JSON.stringify(pkg.version),
    },
    esbuild: isProd
      ? {
          drop: ['console', 'debugger'],
          legalComments: 'none',
          minifyIdentifiers: true,
          minifySyntax: true,
          minifyWhitespace: true,
        }
      : undefined,
    build: {
      ssr: true,
      target: 'node18',
      outDir: 'dist/main',
      emptyOutDir: true,
      minify: isProd ? 'esbuild' : false,
      sourcemap: false,
      lib: {
        entry: path.resolve(__dirname, 'src/main/index.ts'),
        formats: ['cjs'],
        fileName: () => 'index.js',
      },
      rollupOptions: {
        external: [
          'electron',
          'electron-store',
          'electron-updater',
          'socket.io-client',
          'path',
          'fs',
          'fs/promises',
          'os',
          'child_process',
          'net',
          'crypto',
          'url',
          'events',
          'buffer',
          'stream',
          'util',
          'http',
          'https',
        ],
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
  };
});
