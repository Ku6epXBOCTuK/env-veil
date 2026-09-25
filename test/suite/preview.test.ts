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
): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for the masked preview');
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function getLatestRenderedRevision(snapshot: PreviewAuditSnapshot): number {
  return snapshot.renderedRevisions.at(-1) ?? -1;
}

suite('Env Veil masked preview', () => {
  test('sends only masked models and refreshes after edits', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspaceFolder);
    const directory = await mkdtemp(
      join(workspaceFolder.uri.fsPath, '.env-veil-preview-test-'),
    );
    const filePath = join(directory, '.env');
    const uri = vscode.Uri.file(filePath);
    const firstSentinel = 'ENV_VEIL_FIRST_SENTINEL_35D4A1';
    const secondSentinel = 'ENV_VEIL_SECOND_SENTINEL_A18F72';
    const initialText = `# protected configuration\nAPI_KEY="${firstSentinel}"\nEMPTY=\n`;
    const updatedText = `# protected configuration\nAPI_KEY="${secondSentinel}"\nEMPTY=\nADDED=value\n`;

    try {
      await writeFile(filePath, initialText, 'utf8');
      const extension = vscode.extensions.getExtension<EnvVeilExtensionApi>(
        extensionId,
      );
      assert.ok(extension);
      const api = await extension.activate();
      assert.ok(api.previewAudit);
      api.previewAudit.reset();

      await vscode.commands.executeCommand(
        'vscode.open',
        uri,
        vscode.ViewColumn.Active,
      );

      api.previewAudit.simulateWebviewMessage({ type: 'ready' });
      await waitFor(
        () => (api.previewAudit?.snapshot().renders.length ?? 0) > 0,
      );

      const firstSnapshot = api.previewAudit.snapshot();
      assert.ok(firstSnapshot.initialHtml.length > 0);
      assert.ok(!JSON.stringify(firstSnapshot).includes(firstSentinel));
      assert.ok(!firstSnapshot.initialHtml.some((html) => html.includes('API_KEY')));

      const firstRender = firstSnapshot.renders[0];
      assert.ok(firstRender);
      assert.strictEqual(firstRender.revision, 1);
      assert.strictEqual(firstRender.documentVersion, 1);
      assert.strictEqual(firstRender.model.nonEmptyValueCount, 1);
      assert.strictEqual(
        firstRender.model.maskedText,
        '# protected configuration\nAPI_KEY="********"\nEMPTY=\n',
      );
      assert.ok(!Object.hasOwn(firstRender, 'fullText'));
      assert.ok(!Object.hasOwn(firstRender.model, 'fullText'));
      api.previewAudit.simulateWebviewMessage({
        type: 'rendered',
        revision: firstRender.revision,
      });
      await waitFor(() =>
        (api.previewAudit?.snapshot().renderedRevisions.length ?? 0) > 0,
      );

      const document = await vscode.workspace.openTextDocument(uri);
      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        document.uri,
        new vscode.Range(
          document.positionAt(0),
          document.positionAt(document.getText().length),
        ),
        updatedText,
      );
      assert.strictEqual(await vscode.workspace.applyEdit(edit), true);

      await waitFor(() => {
        const latestRender = api.previewAudit?.snapshot().renders.at(-1);
        return Boolean(
          latestRender && latestRender.revision > firstRender.revision,
        );
      });
      const pendingRender = api.previewAudit.snapshot().renders.at(-1);
      assert.ok(pendingRender);
      api.previewAudit.simulateWebviewMessage({
        type: 'rendered',
        revision: pendingRender.revision,
      });
      await waitFor(() =>
        (api.previewAudit?.snapshot().renderedRevisions.length ?? 0) > 1,
      );

      const finalSnapshot = api.previewAudit.snapshot();
      assert.ok(!JSON.stringify(finalSnapshot).includes(firstSentinel));
      assert.ok(!JSON.stringify(finalSnapshot).includes(secondSentinel));

      const latestRender = finalSnapshot.renders.at(-1);
      assert.ok(latestRender);
      assert.ok(latestRender.revision > firstRender.revision);
      assert.ok(latestRender.documentVersion > firstRender.documentVersion);
      assert.strictEqual(latestRender.model.nonEmptyValueCount, 2);
      assert.ok(latestRender.model.maskedText.includes('API_KEY="********"'));
      assert.ok(latestRender.model.maskedText.includes('ADDED=********'));
      assert.strictEqual(
        getLatestRenderedRevision(finalSnapshot),
        latestRender.revision,
      );

      for (let index = 1; index < finalSnapshot.renders.length; index += 1) {
        const previousRender = finalSnapshot.renders[index - 1];
        const currentRender = finalSnapshot.renders[index];
        assert.ok(previousRender);
        assert.ok(currentRender);
        assert.ok(currentRender.revision >= previousRender.revision);
        assert.ok(currentRender.documentVersion >= previousRender.documentVersion);
      }
    } finally {
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      await rm(directory, { recursive: true, force: true });
    }
  });
});
