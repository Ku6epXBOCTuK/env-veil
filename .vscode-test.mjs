import { defineConfig } from '@vscode/test-cli';

const launchArgs = ['--disable-extensions'];
const mocha = {
  ui: 'tdd',
  timeout: 20000,
};

export default defineConfig([
  {
    label: 'defaultEditorResolution',
    files: 'out/test/suite/extension.test.js',
    version: 'stable',
    workspaceFolder: './test/fixtures/workspace',
    launchArgs,
    mocha,
  },
  {
    label: 'persistentEditorAssociation',
    files: 'out/test/suite/editorAssociation.test.js',
    version: 'stable',
    workspaceFolder: './test/fixtures/association-workspace',
    launchArgs,
    mocha,
  },
]);
