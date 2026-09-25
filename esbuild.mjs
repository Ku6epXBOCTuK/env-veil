import { rm } from 'node:fs/promises';
import { argv } from 'node:process';
import { build, context } from 'esbuild';

const production = argv.includes('--production');
const watch = argv.includes('--watch');

const buildOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  format: 'cjs',
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  platform: 'node',
  target: 'node20',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  logLevel: 'warning',
};

if (watch) {
  const watchContext = await context(buildOptions);
  await watchContext.watch();
} else {
  await rm('dist', { recursive: true, force: true });
  await build(buildOptions);
}
