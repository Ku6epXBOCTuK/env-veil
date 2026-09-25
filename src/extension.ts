import * as vscode from 'vscode';
import {
  EnvPreviewProvider,
  PreviewAuditRecorder,
  protectedEnvViewType,
  type PreviewAudit,
} from './envPreviewProvider';

export interface EnvVeilExtensionApi {
  readonly previewAudit?: PreviewAudit;
}

export function activate(context: vscode.ExtensionContext): EnvVeilExtensionApi {
  const auditRecorder =
    context.extensionMode === vscode.ExtensionMode.Test
      ? new PreviewAuditRecorder()
      : undefined;
  const provider = new EnvPreviewProvider(context.extensionUri, auditRecorder);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      protectedEnvViewType,
      provider,
    ),
    vscode.commands.registerCommand('envVeil.revealValues', () => {
      provider.revealActive();
    }),
    vscode.commands.registerCommand('envVeil.hideValues', () => {
      provider.hideActive();
    }),
    vscode.commands.registerCommand('envVeil.openInConfiguredEditor', () => {
      return provider.openActive();
    }),
    vscode.window.onDidChangeWindowState((state) => {
      if (!state.focused) {
        provider.hideAll();
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('envVeil.revealTimeoutSeconds')) {
        provider.hideAll();
      }
      if (
        event.affectsConfiguration('envVeil.openIn.mode') ||
        event.affectsConfiguration('envVeil.externalEditor.command') ||
        event.affectsConfiguration('envVeil.externalEditor.args')
      ) {
        provider.refreshEditorLabels();
      }
    }),
  );

  return auditRecorder ? { previewAudit: auditRecorder } : {};
}
