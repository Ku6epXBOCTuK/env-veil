import * as assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { extensionId } from '../support/extensionId';
import type { EnvVeilExtensionApi } from '../../src/extension';
import type { PreviewAuditSnapshot } from '../../src/envPreviewProvider';


async function waitFor(
  predicate: () => boolean,
  timeoutMilliseconds = 10000,
  label = 'the masked preview',
): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function getLatestRenderedRevision(snapshot: PreviewAuditSnapshot): number {
  return snapshot.renderedRevisions.at(-1) ?? -1;
}

async function closeAllEditors(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  await waitFor(
    () => vscode.window.tabGroups.all.every((group) => group.tabs.length === 0),
  );
}

function hasTextEditorTab(uri: vscode.Uri): boolean {
  const expected = uri.toString();
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .some((tab) => {
      const input = tab.input;
      return (
        input instanceof vscode.TabInputText && input.uri.toString() === expected
      );
    });
}

async function resetEnvVeilSettings(): Promise<void> {
  const configuration = vscode.workspace.getConfiguration('envVeil');
  const scoped: readonly [string, vscode.ConfigurationTarget][] = [
    ['openIn.mode', vscode.ConfigurationTarget.Global],
    ['externalEditor.command', vscode.ConfigurationTarget.Global],
    ['externalEditor.args', vscode.ConfigurationTarget.Global],
    ['revealTimeoutSeconds', vscode.ConfigurationTarget.Global],
    ['openIn.mode', vscode.ConfigurationTarget.Workspace],
    ['revealTimeoutSeconds', vscode.ConfigurationTarget.Workspace],
  ];
  for (const [key, target] of scoped) {
    await configuration.update(key, undefined, target);
  }
}

suite('Env Veil masked preview', () => {
  suiteSetup(async () => {
    await resetEnvVeilSettings();
  });

  suiteTeardown(async () => {
    await resetEnvVeilSettings();
  });

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
      api.previewAudit.setWindowFocused(true);

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
      const initialHtml = firstSnapshot.initialHtml[0];
      assert.ok(initialHtml);
      assert.ok(initialHtml.includes('id="open-editor"'));
      assert.ok(initialHtml.includes('id="selected-editor"'));
      assert.ok(initialHtml.includes('id="countdown"'));
      assert.ok(!JSON.stringify(firstSnapshot).includes(firstSentinel));
      assert.ok(!firstSnapshot.initialHtml.some((html) => html.includes('API_KEY')));

      const firstRender = firstSnapshot.renders[0];
      assert.ok(firstRender);
      assert.strictEqual(firstRender.revision, 1);
      assert.strictEqual(firstRender.documentVersion, 1);
       assert.strictEqual(firstRender.model.hasHiddenValues, true);
      assert.strictEqual(firstRender.fullTextSent, false);
      assert.strictEqual(
        firstRender.model.maskedText,
         '# protected configuration\nAPI_KEY="********"\nEMPTY=********\n',
      );
      assert.strictEqual(firstRender.model.maskedText !== null, true);
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
       assert.strictEqual(latestRender.model.hasHiddenValues, true);
      assert.ok(typeof latestRender.model.maskedText === 'string');
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

      const configuration = vscode.workspace.getConfiguration('envVeil');
      await configuration.update(
        'openIn.mode',
        'vscode',
        vscode.ConfigurationTarget.Workspace,
      );
      await waitFor(() => {
        const latestRender = api.previewAudit?.snapshot().renders.at(-1);
        return latestRender?.model.editorLabel === 'VS Code';
      });
      api.previewAudit.simulateWebviewMessage({ type: 'openEditor' });
      await waitFor(
        () => hasTextEditorTab(uri),
        10000,
        'the built-in editor tab',
      );

      await configuration.update(
        'externalEditor.command',
        'subl',
        vscode.ConfigurationTarget.Global,
      );
      await configuration.update(
        'openIn.mode',
        'external',
        vscode.ConfigurationTarget.Workspace,
      );
      try {
        await waitFor(() => {
          const latestRender = api.previewAudit?.snapshot().renders.at(-1);
          return latestRender?.model.editorLabel === 'External: subl';
        });
      } finally {
        await configuration.update(
          'openIn.mode',
          undefined,
          vscode.ConfigurationTarget.Workspace,
        );
        await configuration.update(
          'externalEditor.command',
          undefined,
          vscode.ConfigurationTarget.Global,
        );
      }
    } finally {
      await closeAllEditors();
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('requires an explicit decision for unsaved changes and hides before opening', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspaceFolder);
    const directory = await mkdtemp(
      join(workspaceFolder.uri.fsPath, '.env-veil-unsaved-test-'),
    );
    const filePath = join(directory, '.env');
    const uri = vscode.Uri.file(filePath);
    const sentinel = 'ENV_VEIL_UNSAVED_SENTINEL_6C21B4';

    try {
      await writeFile(filePath, `API_KEY="${sentinel}"\n`, 'utf8');
      const extension = vscode.extensions.getExtension<EnvVeilExtensionApi>(
        extensionId,
      );
      assert.ok(extension);
      const api = await extension.activate();
      assert.ok(api.previewAudit);
      const audit = api.previewAudit;
      audit.reset();
      audit.setWindowFocused(true);

      const configuration = vscode.workspace.getConfiguration('envVeil');
      await configuration.update(
        'openIn.mode',
        'external',
        vscode.ConfigurationTarget.Workspace,
      );
      await configuration.update(
        'externalEditor.command',
        process.execPath,
        vscode.ConfigurationTarget.Global,
      );
      await configuration.update(
        'externalEditor.args',
        ['-e', 'process.exit(0)', '{file}'],
        vscode.ConfigurationTarget.Global,
      );

      try {
        await vscode.commands.executeCommand('vscode.open', uri);
        audit.simulateWebviewMessage({ type: 'ready' });
        await waitFor(() => (audit.snapshot().renders.length ?? 0) > 0);

        const document = await vscode.workspace.openTextDocument(uri);
        const edit = new vscode.WorkspaceEdit();
        edit.insert(
          document.uri,
          new vscode.Position(document.lineCount, 0),
          `\nDIRTY="${sentinel}"\n`,
        );
        assert.strictEqual(await vscode.workspace.applyEdit(edit), true);
        await waitFor(() => document.isDirty);

        audit.setSavePromptResponse('cancel');
        audit.simulateWebviewMessage({ type: 'openEditor' });
        await waitFor(() => audit.savePromptCount === 1);
        await new Promise((resolve) => setTimeout(resolve, 300));
        assert.strictEqual(document.isDirty, true);
        assert.strictEqual(audit.savePromptCount, 1);

        audit.setSavePromptResponse('accept');
        audit.simulateWebviewMessage({ type: 'reveal' });
        await waitFor(() => {
          const latestRender = audit.snapshot().renders.at(-1);
          return latestRender?.state === 'revealed';
        });
        assert.ok(!JSON.stringify(audit.snapshot()).includes(sentinel));

        audit.simulateWebviewMessage({ type: 'openEditor' });
        await waitFor(() => audit.savePromptCount === 2);
        await waitFor(() => document.isDirty === false);
        await waitFor(() => {
          const latestRender = audit.snapshot().renders.at(-1);
          return latestRender?.state === 'hidden';
        });
        const finalRender = audit.snapshot().renders.at(-1);
        assert.strictEqual(finalRender?.state, 'hidden');
        assert.strictEqual(finalRender?.fullTextSent, false);
      } finally {
        await configuration.update(
          'openIn.mode',
          undefined,
          vscode.ConfigurationTarget.Workspace,
        );
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
      }
    } finally {
      await closeAllEditors();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
