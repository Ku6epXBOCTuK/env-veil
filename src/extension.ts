import * as vscode from 'vscode';
import {
  EnvPreviewProvider,
  PreviewAuditRecorder,
  protectedEnvViewType,
  type PreviewAudit,
} from './envPreviewProvider';
import {
  ProtectionAuditRecorder,
  ProtectionMonitor,
  type ProtectionAudit,
} from './protectionMonitor';

export interface EnvVeilExtensionApi {
  readonly previewAudit?: PreviewAudit;
  readonly protectionAudit?: ProtectionAudit;
}

export function activate(context: vscode.ExtensionContext): EnvVeilExtensionApi {
  const isTest = context.extensionMode === vscode.ExtensionMode.Test;
  const auditRecorder = isTest ? new PreviewAuditRecorder() : undefined;
  const protectionAudit = isTest ? new ProtectionAuditRecorder() : undefined;
  const monitor = new ProtectionMonitor(
    protectionAudit,
    isTest
      ? () => Promise.resolve(protectionAudit?.getWarningChoice())
      : (text, restoreLabel) =>
          vscode.window.showWarningMessage(text, restoreLabel),
    (uri) => {
      void vscode.commands.executeCommand(
        'vscode.openWith',
        uri,
        protectedEnvViewType,
      );
    },
  );
  const provider = new EnvPreviewProvider(
    context.extensionUri,
    auditRecorder,
    (uri) => monitor.markIntentionalOpen(uri),
  );

  if (protectionAudit) {
    protectionAudit.attachWindowReset(() => monitor.resetWarningState());
  }

  context.subscriptions.push(
    monitor,
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

  return {
    ...(auditRecorder ? { previewAudit: auditRecorder } : {}),
    ...(protectionAudit ? { protectionAudit } : {}),
  };
}
