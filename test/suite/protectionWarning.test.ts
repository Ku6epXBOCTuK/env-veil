import * as assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { EnvVeilExtensionApi } from '../../src/extension';
import { isProtectedEnvPath } from '../../src/protectionMonitor';
import { protectedEnvViewType } from '../../src/viewType';

const extensionId = 'local-development.env-veil';

type EditorAssociations = Record<string, string>;

async function waitFor(
  predicate: () => boolean,
  timeoutMilliseconds = 10000,
  label = 'the expected state',
): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function closeAllEditors(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  await waitFor(
    () => vscode.window.tabGroups.all.every((group) => group.tabs.length === 0),
    10000,
    'editors to close',
  );
}

async function getProtectionAudit(): Promise<
  NonNullable<EnvVeilExtensionApi['protectionAudit']>
> {
  const extension = vscode.extensions.getExtension<EnvVeilExtensionApi>(
    extensionId,
  );
  assert.ok(extension);
  const api = await extension.activate();
  assert.ok(api.protectionAudit);
  return api.protectionAudit;
}

async function getPreviewAudit(): Promise<
  NonNullable<EnvVeilExtensionApi['previewAudit']>
> {
  const extension = vscode.extensions.getExtension<EnvVeilExtensionApi>(
    extensionId,
  );
  assert.ok(extension);
  const api = await extension.activate();
  assert.ok(api.previewAudit);
  return api.previewAudit;
}

async function createEnvFile(name: string): Promise<{
  directory: string;
  uri: vscode.Uri;
}> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(workspaceFolder);
  const directory = await mkdtemp(
    join(workspaceFolder.uri.fsPath, '.env-veil-protection-test-'),
  );
  const filePath = join(directory, name);
  await writeFile(filePath, 'API_KEY="ENV_VEIL_PROTECTION_SENTINEL"\n', 'utf8');
  return { directory, uri: vscode.Uri.file(filePath) };
}

function getAssociations(): EditorAssociations | undefined {
  return vscode.workspace
    .getConfiguration('workbench')
    .get<EditorAssociations>('editorAssociations');
}

async function openInTextEditor(uri: vscode.Uri): Promise<void> {
  await vscode.commands.executeCommand(
    'vscode.openWith',
    uri,
    'default',
    vscode.ViewColumn.Active,
  );
}

async function openInEnvVeil(uri: vscode.Uri): Promise<void> {
  await vscode.commands.executeCommand(
    'vscode.openWith',
    uri,
    protectedEnvViewType,
    vscode.ViewColumn.Active,
  );
}

suite('Env Veil protection warning', () => {
  suiteSetup(async () => {
    await closeAllEditors();
  });

  suiteTeardown(async () => {
    await closeAllEditors();
  });

  test('recognises only environment file names', () => {
    assert.strictEqual(isProtectedEnvPath('C:\\project\\.env'), true);
    assert.strictEqual(isProtectedEnvPath('C:\\project\\.ENV'), true);
    assert.strictEqual(isProtectedEnvPath('C:\\project\\.env.local'), true);
    assert.strictEqual(
      isProtectedEnvPath('C:\\project\\.env.production.local'),
      true,
    );
    assert.strictEqual(isProtectedEnvPath('C:\\project\\.environment'), false);
    assert.strictEqual(isProtectedEnvPath('C:\\project\\env.js'), false);
    assert.strictEqual(isProtectedEnvPath('C:\\project\\.envrc'), false);
  });

  test('warns once when a protected file is opened in the text editor', async () => {
    const audit = await getProtectionAudit();
    const file = await createEnvFile('.env');

    try {
      audit.reset();
      await openInTextEditor(file.uri);
      await waitFor(
        () => audit.warnings.length > 0,
        10000,
        'the protection warning',
      );
      assert.strictEqual(audit.warnings.length, 1);

      await openInTextEditor(file.uri);
      await new Promise((resolve) => setTimeout(resolve, 500));
      assert.strictEqual(audit.warnings.length, 1);
    } finally {
      await closeAllEditors();
      await rm(file.directory, { recursive: true, force: true });
    }
  });

  test('stays silent while Env Veil itself is active', async () => {
    const audit = await getProtectionAudit();
    const file = await createEnvFile('.env.local');

    try {
      audit.reset();
      await openInEnvVeil(file.uri);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      assert.strictEqual(audit.warnings.length, 0);
    } finally {
      await closeAllEditors();
      await rm(file.directory, { recursive: true, force: true });
    }
  });

  test('does not warn after the own Open in Editor action', async () => {
    const previewAudit = await getPreviewAudit();
    const protectionAudit = await getProtectionAudit();
    const file = await createEnvFile('.env.production.local');

    try {
      await vscode.workspace
        .getConfiguration('envVeil')
        .update('openIn.mode', 'vscode', vscode.ConfigurationTarget.Workspace);
      protectionAudit.reset();
      previewAudit.reset();

      await openInEnvVeil(file.uri);
      previewAudit.simulateWebviewMessage({ type: 'ready' });
      await waitFor(
        () => previewAudit.snapshot().renders.length > 0,
        10000,
        'the masked preview',
      );

      previewAudit.simulateWebviewMessage({ type: 'openEditor' });
      await waitFor(
        () =>
          vscode.window.tabGroups.all
            .flatMap((group) => group.tabs)
            .some((tab) => {
              const input: unknown = tab.input;
              return (
                input instanceof vscode.TabInputText &&
                input.uri.toString() === file.uri.toString()
              );
            }),
        10000,
        'the built-in editor tab',
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      assert.strictEqual(protectionAudit.warnings.length, 0);
    } finally {
      await vscode.workspace
        .getConfiguration('envVeil')
        .update('openIn.mode', undefined, vscode.ConfigurationTarget.Workspace);
      await closeAllEditors();
      await rm(file.directory, { recursive: true, force: true });
    }
  });

  test('never changes editor associations on its own', async () => {
    const audit = await getProtectionAudit();
    const file = await createEnvFile('.env');

    try {
      audit.reset();
      audit.setWarningChoice(undefined);
      const before = getAssociations();
      await openInTextEditor(file.uri);
      await waitFor(
        () => audit.warnings.length > 0,
        10000,
        'the protection warning',
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
      assert.deepEqual(getAssociations(), before);
      assert.deepEqual(
        JSON.parse(audit.associationsAfter),
        JSON.parse(audit.associationsBefore),
      );
    } finally {
      await closeAllEditors();
      await rm(file.directory, { recursive: true, force: true });
    }
  });

  test('opens the file in Env Veil from the warning without touching associations', async () => {
    const audit = await getProtectionAudit();
    const file = await createEnvFile('.env');

    try {
      audit.reset();
      audit.setWarningChoice('Open in Env Veil');
      const before = getAssociations();
      await openInTextEditor(file.uri);
      await waitFor(
        () => audit.restoreRequests.length > 0,
        10000,
        'the restore request',
      );
      await waitFor(
        () =>
          vscode.window.tabGroups.all
            .flatMap((group) => group.tabs)
            .some((tab) => {
              const input: unknown = tab.input;
              return (
                input instanceof vscode.TabInputCustom &&
                input.viewType === protectedEnvViewType &&
                input.uri.toString() === file.uri.toString()
              );
            }),
        10000,
        'the Env Veil tab',
      );
      assert.deepEqual(audit.restoreRequests, [file.uri.toString()]);
      assert.deepEqual(getAssociations(), before);
    } finally {
      await closeAllEditors();
      await rm(file.directory, { recursive: true, force: true });
    }
  });
});
