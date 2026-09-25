import { defineConfig } from '@vscode/test-cli';

const launchArgs = ['--disable-extensions'];
const mocha = {
  ui: 'tdd',
  timeout: 20000,
};

export default defineConfig([
  {
    label: 'defaultEditorResolution',
    files: [
      'out/test/unit/envParser.test.js',
      'out/test/unit/messages.test.js',
      'out/test/unit/previewView.test.js',
      'out/test/suite/extension.test.js',
      'out/test/suite/preview.test.js',
      'out/test/suite/revealLifecycle.test.js',
    ],
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
