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
  );

  return auditRecorder ? { previewAudit: auditRecorder } : {};
}
