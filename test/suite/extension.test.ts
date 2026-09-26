import * as assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { extensionId } from '../support/extensionId';

const protectedEnvViewType = 'envVeil.protectedEnv';
const defaultTextEditorId = 'default';

type EditorAssociations = Record<string, string>;

interface TempEnvFiles {
  directory: string;
  envUri: vscode.Uri;
  productionUri: vscode.Uri;
}

function getEditorAssociations(): EditorAssociations | undefined {
  return vscode.workspace
    .getConfiguration('workbench')
    .get<EditorAssociations>('editorAssociations');
}

async function closeAllEditors(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  const deadline = Date.now() + 10000;
  while (vscode.window.tabGroups.all.some((group) => group.tabs.length > 0)) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for editors to close');
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
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

async function openInTextEditor(
  uri: vscode.Uri,
  pinned = true,
): Promise<void> {
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document, {
    viewColumn: vscode.ViewColumn.Active,
    preview: !pinned,
  });
}

async function openInDefaultTextEditor(uri: vscode.Uri): Promise<void> {
  await vscode.commands.executeCommand(
    'vscode.openWith',
    uri,
    defaultTextEditorId,
    vscode.ViewColumn.Active,
  );
}

function getActiveInput(): unknown {
  return vscode.window.tabGroups.activeTabGroup.activeTab?.input;
}

function getTabCount(): number {
  return vscode.window.tabGroups.all.reduce(
    (count, group) => count + group.tabs.length,
    0,
  );
}

function getTabsForUri(uri: vscode.Uri): readonly vscode.Tab[] {
  const expectedUri = uri.toString();
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter((tab) => {
      const input = tab.input;
      if (
        input instanceof vscode.TabInputText ||
        input instanceof vscode.TabInputCustom
      ) {
        return input.uri.toString() === expectedUri;
      }
      return false;
    });
}

function assertActiveCustomEditor(uri: vscode.Uri): void {
  const input = getActiveInput();
  assert.ok(input instanceof vscode.TabInputCustom);
  assert.strictEqual(input.uri.toString(), uri.toString());
  assert.strictEqual(input.viewType, protectedEnvViewType);
}

function assertActiveTextEditor(uri: vscode.Uri): void {
  const input = getActiveInput();
  const inputType =
    input instanceof vscode.TabInputText
      ? 'text'
      : input instanceof vscode.TabInputCustom
        ? `custom:${input.viewType}`
        : typeof input;
  assert.ok(
    input instanceof vscode.TabInputText,
    `Expected text editor, received ${inputType}`,
  );
  assert.strictEqual(input.uri.toString(), uri.toString());
}

suite('Env Veil editor resolution', () => {
  suiteSetup(async () => {
    await closeAllEditors();
  });

  suiteTeardown(async () => {
    await closeAllEditors();
  });

  test('uses Env Veil by default without creating duplicate tabs', async () => {
    const files = await createTempEnvFiles();

    try {
      await openDefault(files.envUri);
      assertActiveCustomEditor(files.envUri);

      assert.strictEqual(getTabsForUri(files.envUri).length, 1);
      await openDefault(files.envUri);
      assertActiveCustomEditor(files.envUri);
      assert.strictEqual(getTabsForUri(files.envUri).length, 1);

      await openDefault(files.productionUri);
      assertActiveCustomEditor(files.productionUri);
      assert.strictEqual(getTabsForUri(files.productionUri).length, 1);

      const extension = vscode.extensions.getExtension(extensionId);
      assert.ok(extension);
      assert.strictEqual(extension.isActive, true);
    } finally {
      await closeAllEditors();
      await rm(files.directory, { recursive: true, force: true });
    }
  });

  test('does not replace an existing tab from another editor', async () => {
    const files = await createTempEnvFiles();

    try {
      await openInTextEditor(files.envUri);
      assertActiveTextEditor(files.envUri);
      const associations = getEditorAssociations();
      const tabCount = getTabCount();

      await openDefault(files.productionUri);

      assertActiveCustomEditor(files.productionUri);
      assert.strictEqual(getTabCount(), tabCount + 1);
      const originalTabs = getTabsForUri(files.envUri);
      assert.strictEqual(originalTabs.length, 1);
      assert.ok(originalTabs[0]?.input instanceof vscode.TabInputText);
      assert.deepEqual(getEditorAssociations(), associations);
    } finally {
      await closeAllEditors();
      await rm(files.directory, { recursive: true, force: true });
    }
  });

  test('applies a one-time editor choice only to the current file', async () => {
    const files = await createTempEnvFiles();

    try {
      await openDefault(files.envUri);
      assertActiveCustomEditor(files.envUri);
      const associations = getEditorAssociations();

      await openInDefaultTextEditor(files.envUri);
      assertActiveTextEditor(files.envUri);

      await openDefault(files.productionUri);
      assertActiveCustomEditor(files.productionUri);
      assert.deepEqual(getEditorAssociations(), associations);
    } finally {
      await closeAllEditors();
      await rm(files.directory, { recursive: true, force: true });
    }
  });
});
