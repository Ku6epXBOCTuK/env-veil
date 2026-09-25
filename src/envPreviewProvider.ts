import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { createMaskedEnvModel } from './envParser';
import {
  parseWebviewToExtensionMessage,
  type MaskedPreviewModel,
  type RenderMessage,
  type WebviewToExtensionMessage,
} from './messages';

export const protectedEnvViewType = 'envVeil.protectedEnv';

export interface PreviewRenderAudit extends RenderMessage {
  readonly model: MaskedPreviewModel;
}

export interface PreviewAuditSnapshot {
  readonly initialHtml: readonly string[];
  readonly renders: readonly PreviewRenderAudit[];
  readonly renderedRevisions: readonly number[];
}

export interface PreviewAudit {
  snapshot(): PreviewAuditSnapshot;
  reset(): void;
  simulateWebviewMessage(message: WebviewToExtensionMessage): void;
}

export class PreviewAuditRecorder implements PreviewAudit {
  private html: string[] = [];
  private renders: PreviewRenderAudit[] = [];
  private renderedRevisions: number[] = [];
  private readonly messageHandlers = new Set<(value: unknown) => void>();

  public registerMessageHandler(handler: (value: unknown) => void): void {
    this.messageHandlers.add(handler);
  }

  public unregisterMessageHandler(handler: (value: unknown) => void): void {
    this.messageHandlers.delete(handler);
  }

  public simulateWebviewMessage(message: WebviewToExtensionMessage): void {
    for (const handler of this.messageHandlers) {
      handler(message);
    }
  }

  public recordHtml(value: string): void {
    this.html.push(value);
  }

  public recordRender(message: RenderMessage): void {
    this.renders.push({
      ...message,
      model: { ...message.model },
    });
  }

  public recordRendered(revision: number): void {
    this.renderedRevisions.push(revision);
  }

  public snapshot(): PreviewAuditSnapshot {
    return {
      initialHtml: [...this.html],
      renders: this.renders.map((render) => ({
        ...render,
        model: { ...render.model },
      })),
      renderedRevisions: [...this.renderedRevisions],
    };
  }

  public reset(): void {
    this.html = [];
    this.renders = [];
    this.renderedRevisions = [];
  }
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): string {
  const resourceRoot = vscode.Uri.joinPath(
    extensionUri,
    'dist',
    'webview',
  );
  const scriptUri = escapeHtmlAttribute(
    webview.asWebviewUri(vscode.Uri.joinPath(resourceRoot, 'main.js')).toString(),
  );
  const stylesUri = escapeHtmlAttribute(
    webview.asWebviewUri(vscode.Uri.joinPath(resourceRoot, 'styles.css')).toString(),
  );
  const cspSource = escapeHtmlAttribute(webview.cspSource);
  const nonce = escapeHtmlAttribute(randomUUID().replaceAll('-', ''));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${cspSource}; base-uri 'none'; form-action 'none'; object-src 'none';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${stylesUri}">
  <title>Env Veil</title>
</head>
<body>
  <main class="preview-shell">
    <header class="preview-header">
      <div class="preview-identity">
        <h1 class="preview-title">Env Veil</h1>
        <p class="preview-subtitle">Protected preview</p>
      </div>
      <div class="preview-status" role="status" aria-live="polite">
        <span class="preview-status-label" id="status">Loading protected preview…</span>
      </div>
    </header>
    <pre class="document-preview" id="preview" tabindex="0" aria-label="Masked environment file" aria-busy="true"></pre>
  </main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

class PreviewSession {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly documentUri: string;
  private revision = 0;
  private documentVersion = 0;
  private latestMessage: RenderMessage | undefined;
  private isReady = false;
  private isDisposed = false;
  private lastPostedRevision = 0;

  public constructor(
    private readonly document: vscode.TextDocument,
    private readonly webviewPanel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly audit: PreviewAuditRecorder | undefined,
  ) {
    this.documentUri = document.uri.toString();
  }

  private readonly receiveWebviewMessage = (value: unknown): void => {
    this.handleWebviewMessage(value);
  };

  public start(token: vscode.CancellationToken): void {
    this.updateModel();
    this.audit?.registerMessageHandler(this.receiveWebviewMessage);

    this.disposables.push(
      this.webviewPanel.webview.onDidReceiveMessage(this.receiveWebviewMessage),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (
          event.document.uri.toString() === this.documentUri &&
          event.document.version !== this.documentVersion
        ) {
          this.updateModel();
        }
      }),
      this.webviewPanel.onDidDispose(() => {
        this.dispose();
      }),
      token.onCancellationRequested(() => {
        this.dispose();
      }),
    );

    const html = getWebviewHtml(
      this.webviewPanel.webview,
      this.extensionUri,
    );
    this.audit?.recordHtml(html);
    this.webviewPanel.webview.html = html;
  }

  private handleWebviewMessage(value: unknown): void {
    const message = parseWebviewToExtensionMessage(value);
    if (!message) {
      return;
    }
    if (message.type === 'ready') {
      this.isReady = true;
      void this.postLatestMessage(true);
      return;
    }
    if (message.revision === this.revision) {
      this.audit?.recordRendered(message.revision);
    }
  }

  private updateModel(): void {
    if (this.isDisposed) {
      return;
    }
    const model = createMaskedEnvModel(this.document.getText());
    this.revision += 1;
    this.documentVersion = this.document.version;
    this.latestMessage = {
      type: 'render',
      revision: this.revision,
      documentVersion: this.documentVersion,
      model,
    };
    void this.postLatestMessage(false);
  }

  private async postLatestMessage(force: boolean): Promise<void> {
    const message = this.latestMessage;
    if (
      this.isDisposed ||
      !this.isReady ||
      !message ||
      (!force && message.revision <= this.lastPostedRevision)
    ) {
      return;
    }

    this.audit?.recordRender(message);
    try {
      const delivered = await this.webviewPanel.webview.postMessage(message);
      if (delivered && !this.isDisposed) {
        this.lastPostedRevision = Math.max(
          this.lastPostedRevision,
          message.revision,
        );
      }
    } catch {
      return;
    }
  }

  public dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    this.audit?.unregisterMessageHandler(this.receiveWebviewMessage);
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }
}

export class EnvPreviewProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = protectedEnvViewType;

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly auditRecorder: PreviewAuditRecorder | undefined,
  ) {}

  public resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    token: vscode.CancellationToken,
  ): void {
    webviewPanel.webview.options = {
      enableScripts: true,
      enableForms: false,
      enableCommandUris: false,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview'),
      ],
    };

    const session = new PreviewSession(
      document,
      webviewPanel,
      this.extensionUri,
      this.auditRecorder,
    );
    session.start(token);
  }
}
