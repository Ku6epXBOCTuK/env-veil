import { rm } from 'node:fs/promises';
import { argv } from 'node:process';
import { build, context } from 'esbuild';

const production = argv.includes('--production');
const watch = argv.includes('--watch');

const sharedOptions = {
  bundle: true,
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  target: 'es2022',
  logLevel: 'warning',
};

const extensionOptions = {
  ...sharedOptions,
  entryPoints: ['src/extension.ts'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  outfile: 'dist/extension.js',
  external: ['vscode'],
};

const webviewOptions = {
  ...sharedOptions,
  entryPoints: ['src/webview/main.ts', 'src/webview/styles.css'],
  format: 'iife',
  platform: 'browser',
  outdir: 'dist/webview',
};

if (watch) {
  const watchContexts = await Promise.all([
    context(extensionOptions),
    context(webviewOptions),
  ]);
  await Promise.all(watchContexts.map((watchContext) => watchContext.watch()));
} else {
  await rm('dist', { recursive: true, force: true });
  await Promise.all([
    build(extensionOptions),
    build(webviewOptions),
  ]);
}
