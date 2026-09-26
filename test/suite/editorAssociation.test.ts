import * as assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as vscode from 'vscode';

const protectedEnvViewType = 'envVeil.protectedEnv';
const defaultTextEditorId = 'default';

type EditorAssociations = Record<string, string>;

interface TempEnvFiles {
  directory: string;
  envUri: vscode.Uri;
  productionUri: vscode.Uri;
}

async function closeAllEditors(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

async function createTempEnvFiles(): Promise<TempEnvFiles> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(workspaceFolder);
  const directory = await mkdtemp(
    join(workspaceFolder.uri.fsPath, '.env-veil-test-'),
  );
  const envPath = join(directory, '.env');
  const productionPath = join(directory, '.env.production.local');

  await Promise.all([
    writeFile(envPath, 'SCAFFOLD_TEST_VALUE=not-a-secret\n', 'utf8'),
    writeFile(productionPath, 'SCAFFOLD_TEST_VALUE=also-not-a-secret\n', 'utf8'),
  ]);

  return {
    directory,
    envUri: vscode.Uri.file(envPath),
    productionUri: vscode.Uri.file(productionPath),
  };
}

async function openDefault(uri: vscode.Uri): Promise<void> {
  await vscode.commands.executeCommand('vscode.open', uri, vscode.ViewColumn.Active);
}

function getActiveInput(): unknown {
  return vscode.window.tabGroups.activeTabGroup.activeTab?.input;
}

function assertActiveCustomEditor(uri: vscode.Uri): void {
  const input = getActiveInput();
  assert.ok(input instanceof vscode.TabInputCustom);
  assert.strictEqual(input.uri.toString(), uri.toString());
  assert.strictEqual(input.viewType, protectedEnvViewType);
}

function assertActiveTextEditor(uri: vscode.Uri): void {
  const input = getActiveInput();
  assert.ok(input instanceof vscode.TabInputText);
  assert.strictEqual(input.uri.toString(), uri.toString());
}

function getEditorAssociations(): EditorAssociations {
  return (
    vscode.workspace
      .getConfiguration('workbench')
      .get<EditorAssociations>('editorAssociations', {}) ?? {}
  );
}

suite('Env Veil persistent editor association', () => {
  test('honors an existing override without changing it', async () => {
    const files = await createTempEnvFiles();
    const expectedAssociations: EditorAssociations = {
      '**/.env': defaultTextEditorId,
    };

    try {
      assert.deepEqual(getEditorAssociations(), expectedAssociations);

      await openDefault(files.envUri);
      assertActiveTextEditor(files.envUri);
      assert.deepEqual(getEditorAssociations(), expectedAssociations);

      await closeAllEditors();
      await openDefault(files.productionUri);
      assertActiveCustomEditor(files.productionUri);
      assert.deepEqual(getEditorAssociations(), expectedAssociations);
    } finally {
      await closeAllEditors();
      await rm(files.directory, { recursive: true, force: true });
    }
  });
});
