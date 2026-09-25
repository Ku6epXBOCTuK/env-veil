import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import {
  getEditorLabel,
  getExternalEditorSettings,
  getOpenInMode,
} from '../../src/config';
import {
  launchExternalEditor,
  resolveExternalEditorArgs,
} from '../../src/externalEditor';

suite('external editor arguments', () => {
  test('passes paths with spaces and shell characters as single arguments', () => {
    const filePath = 'C:\\Project With Spaces\\.env';
    assert.deepEqual(
      resolveExternalEditorArgs(['--new-window', '{file}'], filePath),
      ['--new-window', filePath],
    );
  });

  test('replaces workspace and file placeholders without splitting arguments', () => {
    assert.deepEqual(
      resolveExternalEditorArgs(
        ['--cwd', '{workspaceFolder}', '--file', '{file}'],
        'C:\\a+b\\.env',
        'C:\\work space',
      ),
      ['--cwd', 'C:\\work space', '--file', 'C:\\a+b\\.env'],
    );
  });

  test('appends the file when no file placeholder is present', () => {
    assert.deepEqual(
      resolveExternalEditorArgs(['--wait'], 'C:\\project\\.env', 'C:\\project'),
      ['--wait', 'C:\\project\\.env'],
    );
  });

  test('ignores workspace values for machine-scoped external settings', async () => {
    const configuration = vscode.workspace.getConfiguration('envVeil');
    await configuration.update(
      'externalEditor.command',
      'global-command',
      vscode.ConfigurationTarget.Global,
    );
    await configuration.update(
      'externalEditor.args',
      ['--global'],
      vscode.ConfigurationTarget.Global,
    );
    await configuration.update(
      'openIn.mode',
      'external',
      vscode.ConfigurationTarget.Workspace,
    );
    try {
      const inspected = configuration.inspect<string>('externalEditor.command');
      assert.strictEqual(inspected?.workspaceValue, undefined);
      assert.strictEqual(getOpenInMode(), 'external');
      assert.strictEqual(getExternalEditorSettings().command, 'global-command');
      assert.deepEqual(getExternalEditorSettings().args, ['--global']);
      assert.strictEqual(getEditorLabel(), 'External: global-command');
    } finally {
      await configuration.update(
        'externalEditor.command',
        undefined,
        vscode.ConfigurationTarget.Global,
      );
      await configuration.update(
        'externalEditor.args',
        undefined,
        vscode.ConfigurationTarget.Global,
      );
      await configuration.update(
        'openIn.mode',
        undefined,
        vscode.ConfigurationTarget.Workspace,
      );
    }
  });

  test('rejects when the configured command does not exist', async () => {
    await assert.rejects(
      launchExternalEditor(
        { filePath: 'C:\\project\\.env' },
        { command: 'env-veil-nonexistent-editor', args: [] },
      ),
      /ENOENT/,
    );
  });

  test('resolves when the configured command starts successfully', async () => {
    await launchExternalEditor(
      { filePath: 'C:\\project\\.env' },
      { command: process.execPath, args: ['-e', 'process.exit(0)'] },
    );
  });
});
