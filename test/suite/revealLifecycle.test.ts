import * as assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { EnvVeilExtensionApi } from '../../src/extension';
import type { PreviewAuditSnapshot } from '../../src/envPreviewProvider';

const extensionId = 'local-development.env-veil';
const defaultEditorId = 'default';

async function waitFor(
  predicate: () => boolean,
  timeoutMilliseconds = 10000,
): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for the reveal lifecycle');
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function latest(snapshot: PreviewAuditSnapshot | undefined) {
  return snapshot?.renders.at(-1);
}

suite('Env Veil reveal lifecycle', () => {
  test('reveals once, hides safely, and auto-hides on timeout', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspaceFolder);
    const directory = await mkdtemp(
      join(workspaceFolder.uri.fsPath, '.env-veil-reveal-test-'),
    );
    const filePath = join(directory, '.env');
    const uri = vscode.Uri.file(filePath);
    const sentinel = 'ENV_VEIL_REVEAL_SENTINEL_4C8A';
    const configuration = vscode.workspace.getConfiguration('envVeil');

    try {
      await writeFile(filePath, `API_KEY=${sentinel}\n`, 'utf8');
      const extension = vscode.extensions.getExtension<EnvVeilExtensionApi>(
        extensionId,
      );
      assert.ok(extension);
      const api = await extension.activate();
      assert.ok(api.previewAudit);
      const commands = await vscode.commands.getCommands(true);
      assert.ok(commands.includes('envVeil.revealValues'));
      assert.ok(commands.includes('envVeil.hideValues'));
      api.previewAudit.reset();
      await vscode.commands.executeCommand(
        'vscode.open',
        uri,
        vscode.ViewColumn.Active,
      );
      api.previewAudit.simulateWebviewMessage({ type: 'ready' });
      await waitFor(() => (api.previewAudit?.snapshot().renders.length ?? 0) > 0);

      api.previewAudit.simulateWebviewMessage({ type: 'reveal' });
      await waitFor(() => latest(api.previewAudit?.snapshot())?.state === 'revealed');
      let snapshot = api.previewAudit.snapshot();
      const revealed = latest(snapshot);
      assert.ok(revealed);
      assert.strictEqual(revealed.fullTextSent, true);
      assert.strictEqual(revealed.model.maskedText, null);
      assert.ok(!JSON.stringify(snapshot).includes(sentinel));

      const revealCount = snapshot.renders.length;
      api.previewAudit.simulateWebviewMessage({ type: 'reveal' });
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.strictEqual(api.previewAudit.snapshot().renders.length, revealCount);

      await vscode.commands.executeCommand('envVeil.hideValues');
      await waitFor(() => {
        const current = latest(api.previewAudit?.snapshot());
        return Boolean(current && current.state === 'hidden' && current.revision > revealed.revision);
      });
      snapshot = api.previewAudit.snapshot();
      assert.ok(!JSON.stringify(snapshot).includes(sentinel));

      api.previewAudit.simulateWebviewMessage({ type: 'reveal' });
      await waitFor(() => latest(api.previewAudit?.snapshot())?.state === 'revealed');
      await configuration.update(
        'revealTimeoutSeconds',
        1,
        vscode.ConfigurationTarget.Workspace,
      );
      await waitFor(() => latest(api.previewAudit?.snapshot())?.state === 'hidden');

      api.previewAudit.simulateWebviewMessage({ type: 'reveal' });
      await waitFor(() => latest(api.previewAudit?.snapshot())?.state === 'revealed');
      api.previewAudit.simulateWebviewMessage({ type: 'focusLost' });
      await waitFor(() => latest(api.previewAudit?.snapshot())?.state === 'hidden');
      assert.ok(!JSON.stringify(api.previewAudit.snapshot()).includes(sentinel));

      api.previewAudit.simulateWebviewMessage({ type: 'reveal' });
      await waitFor(() => latest(api.previewAudit?.snapshot())?.state === 'revealed');
      await vscode.commands.executeCommand(
        'vscode.openWith',
        uri,
        defaultEditorId,
        vscode.ViewColumn.Active,
      );
      await waitFor(() => {
        const current = latest(api.previewAudit?.snapshot());
        return Boolean(current && current.state === 'hidden');
      });

      await configuration.update(
        'revealTimeoutSeconds',
        1,
        vscode.ConfigurationTarget.Workspace,
      );
      await vscode.commands.executeCommand('vscode.open', uri, vscode.ViewColumn.Active);
      api.previewAudit.simulateWebviewMessage({ type: 'ready' });
      await waitFor(() => latest(api.previewAudit?.snapshot())?.state === 'hidden');
      api.previewAudit.simulateWebviewMessage({ type: 'reveal' });
      await waitFor(() => latest(api.previewAudit?.snapshot())?.state === 'revealed');
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await waitFor(() => latest(api.previewAudit?.snapshot())?.state === 'hidden');
      assert.ok(!JSON.stringify(api.previewAudit.snapshot()).includes(sentinel));

      api.previewAudit.simulateWebviewMessage({ type: 'reveal' });
      await waitFor(() => latest(api.previewAudit?.snapshot())?.state === 'revealed');
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      api.previewAudit.reset();
      await vscode.commands.executeCommand(
        'vscode.open',
        uri,
        vscode.ViewColumn.Active,
      );
      api.previewAudit.simulateWebviewMessage({ type: 'ready' });
      await waitFor(() => (api.previewAudit?.snapshot().renders.length ?? 0) > 0);
      const reopenedRender = latest(api.previewAudit.snapshot());
      assert.ok(reopenedRender);
      assert.strictEqual(reopenedRender.state, 'hidden');
      assert.strictEqual(reopenedRender.fullTextSent, false);
    } finally {
      await configuration.update(
        'revealTimeoutSeconds',
        undefined,
        vscode.ConfigurationTarget.Workspace,
      );
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      await rm(directory, { recursive: true, force: true });
    }
  });
});
