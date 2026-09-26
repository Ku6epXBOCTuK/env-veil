import * as assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { EnvVeilExtensionApi } from '../../src/extension';
import type { PreviewAuditSnapshot } from '../../src/envPreviewProvider';

const extensionId = 'local-development.env-veil';

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

function latestHiddenMask(snapshot: PreviewAuditSnapshot): string | null {
  return snapshot.renders.at(-1)?.model.maskedText ?? null;
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

suite('Env Veil external file changes', () => {
  suiteSetup(async () => {
    await closeAllEditors();
  });

  suiteTeardown(async () => {
    await closeAllEditors();
  });

  test('reloads the preview after the file changes outside VS Code', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspaceFolder);
    const directory = await mkdtemp(
      join(workspaceFolder.uri.fsPath, '.env-veil-external-test-'),
    );
    const filePath = join(directory, '.env');
    const uri = vscode.Uri.file(filePath);
    const firstSecret = 'ENV_VEIL_EXTERNAL_FIRST';
    const secondSecret = 'ENV_VEIL_EXTERNAL_SECOND';

    try {
      await writeFile(filePath, `API_KEY="${firstSecret}"\n`, 'utf8');
      const audit = await getPreviewAudit();
      audit.reset();

      await vscode.commands.executeCommand('vscode.open', uri);
      audit.simulateWebviewMessage({ type: 'ready' });
      await waitFor(
        () => audit.snapshot().renders.length > 0,
        10000,
        'the initial preview',
      );
      assert.ok(latestHiddenMask(audit.snapshot())?.includes('API_KEY="********"'));
      assert.ok(!JSON.stringify(audit.snapshot()).includes(firstSecret));

      await writeFile(
        filePath,
        `API_KEY="${secondSecret}"\nADDED=extra\n`,
        'utf8',
      );
      await waitFor(
        () =>
          (latestHiddenMask(audit.snapshot())?.includes('ADDED=********') ?? false),
        10000,
        'the updated preview',
      );
      const updatedSnapshot = audit.snapshot();
      const latestRender = updatedSnapshot.renders.at(-1);
      assert.strictEqual(latestRender?.state, 'hidden');
      assert.strictEqual(latestRender?.fullTextSent, false);
      assert.ok(!JSON.stringify(updatedSnapshot).includes(firstSecret));
      assert.ok(!JSON.stringify(updatedSnapshot).includes(secondSecret));

      audit.simulateWebviewMessage({ type: 'reveal' });
      await waitFor(
        () => audit.snapshot().renders.at(-1)?.state === 'revealed',
        10000,
        'the revealed state',
      );
      const revealed = audit.snapshot().renders.at(-1);
      assert.strictEqual(revealed?.state, 'revealed');
      assert.ok(!JSON.stringify(revealed).includes(firstSecret));
    } finally {
      await closeAllEditors();
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('hides again when the file changes while values are revealed', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspaceFolder);
    const directory = await mkdtemp(
      join(workspaceFolder.uri.fsPath, '.env-veil-external-reveal-test-'),
    );
    const filePath = join(directory, '.env');
    const uri = vscode.Uri.file(filePath);

    try {
      await writeFile(filePath, 'API_KEY="ENV_VEIL_REVEAL_FIRST"\n', 'utf8');
      const audit = await getPreviewAudit();
      audit.reset();

      await vscode.commands.executeCommand('vscode.open', uri);
      audit.simulateWebviewMessage({ type: 'ready' });
      await waitFor(
        () => audit.snapshot().renders.length > 0,
        10000,
        'the initial preview',
      );

      audit.simulateWebviewMessage({ type: 'reveal' });
      await waitFor(
        () => audit.snapshot().renders.at(-1)?.state === 'revealed',
        10000,
        'the revealed state',
      );

      await writeFile(filePath, 'API_KEY="ENV_VEIL_REVEAL_SECOND"\n', 'utf8');
      await waitFor(
        () => audit.snapshot().renders.at(-1)?.state === 'hidden',
        10000,
        'the values to hide again',
      );
      const afterChange = audit.snapshot().renders.at(-1);
      assert.strictEqual(afterChange?.state, 'hidden');
      assert.strictEqual(afterChange?.fullTextSent, false);
    } finally {
      await closeAllEditors();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
