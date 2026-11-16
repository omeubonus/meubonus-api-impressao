import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => {
  const isProd = mode === 'production';

  return {
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
      outDir: 'dist/preload',
      emptyOutDir: true,
      minify: isProd ? 'esbuild' : false,
      sourcemap: false,
      lib: {
        entry: path.resolve(__dirname, 'src/preload/index.ts'),
        formats: ['cjs'],
        fileName: () => 'index.js',
      },
      rollupOptions: {
        external: [
          'electron',
          'path',
          'fs',
          'os',
          'crypto',
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
