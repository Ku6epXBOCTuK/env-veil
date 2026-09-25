import * as assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';

const extensionId = 'local-development.env-veil';
const protectedEnvViewType = 'envVeil.protectedEnv';

suite('Env Veil extension scaffold', () => {
  test('opens a .env file with the custom editor', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'env-veil-'));
    const filePath = join(directory, '.env');
    const uri = vscode.Uri.file(filePath);

    try {
      await writeFile(filePath, 'SCAFFOLD_TEST_VALUE=not-a-secret\n', 'utf8');
      await vscode.commands.executeCommand(
        'vscode.openWith',
        uri,
        protectedEnvViewType,
        vscode.ViewColumn.Active,
      );

      const extension = vscode.extensions.getExtension(extensionId);
      assert.ok(extension);
      assert.strictEqual(extension.isActive, true);

      const activeInput = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
      assert.ok(activeInput instanceof vscode.TabInputCustom);
      assert.strictEqual(activeInput.viewType, protectedEnvViewType);
    } finally {
      await Promise.allSettled([
        vscode.commands.executeCommand('workbench.action.closeAllEditors'),
      ]);
      await rm(directory, { recursive: true, force: true });
    }
  });
});
