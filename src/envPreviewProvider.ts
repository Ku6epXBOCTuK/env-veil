import * as nodePath from 'node:path';
import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import {
  getEditorLabel,
  getOpenInMode,
  getRevealTimeoutSeconds,
} from './config';
import {
  createMaskedEnvModel,
  type MaskedEnvModel,
} from './envParser';
import { launchExternalEditor } from './externalEditor';
import {
  parseWebviewToExtensionMessage,
  type RenderMessage,
  type WebviewToExtensionMessage,
} from './messages';
import { protectedEnvViewType } from './viewType';

export { protectedEnvViewType };

export interface PreviewAuditModel {
  readonly maskedText: string | null;
  readonly hasHiddenValues: boolean;
  readonly hasMultilineValues: boolean;
  readonly editorLabel: string;
}

export interface PreviewRenderAudit {
  readonly type: 'render';
  readonly revision: number;
  readonly documentVersion: number;
  readonly state: 'hidden' | 'revealed';
  readonly model: PreviewAuditModel;
  readonly fullTextSent: boolean;
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
  simulatePanelActive(): void;
  setSavePromptResponse(response: SavePromptResponse): void;
  readonly savePromptCount: number;
}

export type SavePromptResponse = 'accept' | 'cancel';

export type SavePromptRequest = () => Promise<boolean>;

async function requestSaveBeforeOpen(): Promise<boolean> {
  const choice = await vscode.window.showWarningMessage(
    'This environment file has unsaved changes. Save before opening the configured editor?',
    { modal: true },
    'Save and Open',
    'Cancel',
  );
  return choice === 'Save and Open';
}

export class PreviewAuditRecorder implements PreviewAudit {
  private html: string[] = [];
  private renders: PreviewRenderAudit[] = [];
  private renderedRevisions: number[] = [];
  private savePromptResponse: SavePromptResponse = 'cancel';
  private savePrompts = 0;
  private readonly messageHandlers = new Set<(value: unknown) => void>();
  private readonly activeHandlers = new Set<() => void>();

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

  public registerActiveHandler(handler: () => void): void {
    this.activeHandlers.add(handler);
  }

  public unregisterActiveHandler(handler: () => void): void {
    this.activeHandlers.delete(handler);
  }

  public simulatePanelActive(): void {
    for (const handler of this.activeHandlers) {
      handler();
    }
  }

  public get savePromptCount(): number {
    return this.savePrompts;
  }

  public setSavePromptResponse(response: SavePromptResponse): void {
    this.savePromptResponse = response;
  }

  public readonly requestSaveBeforeOpen: SavePromptRequest = () => {
    this.savePrompts += 1;
    return Promise.resolve(this.savePromptResponse === 'accept');
  };

  public recordHtml(value: string): void {
    this.html.push(value);
  }

  public recordRender(message: RenderMessage): void {
    this.renders.push({
      type: 'render',
      revision: message.revision,
      documentVersion: message.documentVersion,
      state: message.model.kind,
      model: {
        maskedText:
          message.model.kind === 'hidden' ? message.model.maskedText : null,
        hasHiddenValues: message.model.hasHiddenValues,
        hasMultilineValues: message.model.hasMultilineValues,
        editorLabel: message.model.editorLabel,
      },
      fullTextSent: message.model.kind === 'revealed',
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
    this.savePromptResponse = 'cancel';
    this.savePrompts = 0;
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
      <div class="preview-toolbar">
        <div class="preview-actions" role="group" aria-label="Value visibility">
          <button class="preview-button" id="reveal-values" type="button" disabled>Reveal Values</button>
          <button class="preview-button" id="hide-values" type="button" hidden>Hide Values</button>
          <button class="preview-button preview-button-secondary" id="open-editor" type="button">Open in Editor</button>
        </div>
        <div class="preview-meta">
          <div class="preview-status" role="status" aria-live="polite">
            <span class="preview-status-label" id="status">Loading protected preview…</span>
          </div>
          <span class="preview-editor-choice">Editor: <strong id="selected-editor">VS Code</strong></span>
          <span class="preview-countdown" id="countdown" aria-label="Automatic hide countdown" aria-live="off" hidden></span>
        </div>
      </div>
    </header>
    <pre class="document-preview" id="preview" tabindex="0" aria-label="Masked environment file" aria-busy="true"></pre>
  </main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

type SessionCallback = (session: PreviewSession) => void;
type OpenEditorCallback = (session: PreviewSession) => Promise<void>;

const diskRefreshDelayMilliseconds = 120;
const utf8Decoder = new TextDecoder('utf-8', { ignoreBOM: true });

class PreviewSession {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly documentUri: string;
  private revision = 0;
  private documentVersion = 0;
  private maskedModel: MaskedEnvModel | undefined;
  private latestHiddenMessage: RenderMessage | undefined;
  private pendingMessage: RenderMessage | undefined;
  private isSending = false;
  private isReady = false;
  private isDisposed = false;
  private isRevealed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private timerGeneration = 0;
  private lastPostedRevision = 0;
  private sourceText: string | undefined;
  private diskRefreshTimer: ReturnType<typeof setTimeout> | undefined;

  public constructor(
    private readonly document: vscode.TextDocument,
    private readonly webviewPanel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly audit: PreviewAuditRecorder | undefined,
    private readonly onActive: SessionCallback,
    private readonly onDisposed: SessionCallback,
    private readonly onOpenEditor: OpenEditorCallback,
    private readonly requestSaveBeforeOpen: SavePromptRequest,
    private readonly markIntentionalOpen: (uri: vscode.Uri) => void,
  ) {
    this.documentUri = document.uri.toString();
  }

  private readonly receiveWebviewMessage = (value: unknown): void => {
    this.handleWebviewMessage(value);
  };

  private readonly replayHiddenModel = (): void => {
    if (!this.isRevealed && this.latestHiddenMessage) {
      this.revision += 1;
      this.latestHiddenMessage = {
        ...this.latestHiddenMessage,
        revision: this.revision,
      };
      this.enqueueRender(this.latestHiddenMessage, true);
    }
  };

  public start(token: vscode.CancellationToken): void {
    this.refreshHiddenModel();
    this.audit?.registerMessageHandler(this.receiveWebviewMessage);
    this.audit?.registerActiveHandler(this.replayHiddenModel);

    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(
        vscode.Uri.file(nodePath.dirname(this.document.uri.fsPath)),
        nodePath.basename(this.document.uri.fsPath),
      ),
    );
    const scheduleDiskRefresh = (): void => {
      if (this.diskRefreshTimer !== undefined) {
        clearTimeout(this.diskRefreshTimer);
      }
      this.diskRefreshTimer = setTimeout(() => {
        this.diskRefreshTimer = undefined;
        void this.refreshFromDisk();
      }, diskRefreshDelayMilliseconds);
    };
    const cancelScheduledDiskRefresh = (): void => {
      if (this.diskRefreshTimer !== undefined) {
        clearTimeout(this.diskRefreshTimer);
        this.diskRefreshTimer = undefined;
      }
    };

    this.disposables.push(
      watcher,
      watcher.onDidChange(scheduleDiskRefresh),
      watcher.onDidCreate(scheduleDiskRefresh),
      watcher.onDidDelete(scheduleDiskRefresh),
      this.webviewPanel.webview.onDidReceiveMessage(this.receiveWebviewMessage),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (
          event.document.uri.toString() === this.documentUri &&
          event.document.version !== this.documentVersion
        ) {
          cancelScheduledDiskRefresh();
          this.sourceText = undefined;
          this.refreshHiddenModel();
        }
      }),
      this.webviewPanel.onDidChangeViewState((event) => {
        if (event.webviewPanel.active) {
          this.onActive(this);
          if (this.isRevealed) {
            this.hide();
          } else {
            this.replayHiddenModel();
          }
          void this.refreshFromDisk();
        } else {
          this.hide();
        }
      }),
      this.webviewPanel.onDidDispose(() => {
        this.dispose();
      }),
      token.onCancellationRequested(() => {
        this.dispose();
      }),
    );

    if (this.webviewPanel.active) {
      this.onActive(this);
    }

    const html = getWebviewHtml(
      this.webviewPanel.webview,
      this.extensionUri,
    );
    this.audit?.recordHtml(html);
    this.webviewPanel.webview.html = html;
  }

  public reveal(): void {
    if (!this.canReveal()) {
      return;
    }

    const fullText = this.currentText();
    const timeoutSeconds = getRevealTimeoutSeconds();
    const revealExpiresAt = Date.now() + timeoutSeconds * 1000;
    this.isRevealed = true;
    this.revision += 1;
    const message: RenderMessage = {
      type: 'render',
      revision: this.revision,
      documentVersion: this.documentVersion,
      model: {
        kind: 'revealed',
        fullText,
        hasHiddenValues: this.maskedModel?.hasHiddenValues ?? false,
        hasMultilineValues: this.maskedModel?.hasMultilineValues ?? false,
        editorLabel: getEditorLabel(),
        revealExpiresAt,
      },
    };
    this.enqueueRender(message, false);
    this.startTimer(timeoutSeconds);
  }

  public hide(): void {
    this.clearTimer();
    if (this.isRevealed) {
      this.isRevealed = false;
      this.refreshHiddenModel();
      return;
    }
    if (this.pendingMessage?.model.kind === 'revealed') {
      this.pendingMessage = this.latestHiddenMessage;
    }
  }

  public refreshEditorLabel(): void {
    if (this.isDisposed) {
      return;
    }
    const editorLabel = getEditorLabel();
    if (this.latestHiddenMessage?.model.editorLabel === editorLabel) {
      return;
    }
    if (this.isRevealed) {
      this.hide();
      return;
    }
    this.refreshHiddenModel();
  }

  public async openInConfiguredEditor(): Promise<void> {
    this.hide();
    const mode = getOpenInMode();
    if (mode === 'external' && vscode.env.remoteName === undefined) {
      if (this.document.isDirty) {
        if (!(await this.requestSaveBeforeOpen())) {
          return;
        }
        if (!(await this.document.save())) {
          void vscode.window.showErrorMessage(
            'Env Veil could not save the document before opening the configured editor.',
          );
          return;
        }
      }
      try {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(
          this.document.uri,
        )?.uri.fsPath;
        this.markIntentionalOpen(this.document.uri);
        await launchExternalEditor({
          filePath: this.document.uri.fsPath,
          ...(workspaceFolder ? { workspaceFolder } : {}),
        });
        return;
      } catch {
        void vscode.window.showErrorMessage(
          'Env Veil could not start the configured external editor. Opening in VS Code instead.',
        );
      }
    }
    if (mode === 'external' && vscode.env.remoteName !== undefined) {
      void vscode.window.showInformationMessage(
        'External editors are unavailable in a remote workspace. Opening in VS Code instead.',
      );
    }
    this.markIntentionalOpen(this.document.uri);
    await vscode.commands.executeCommand(
      'vscode.openWith',
      this.document.uri,
      'default',
      vscode.ViewColumn.Active,
    );
  }

  public dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    this.clearTimer();
    if (this.diskRefreshTimer !== undefined) {
      clearTimeout(this.diskRefreshTimer);
      this.diskRefreshTimer = undefined;
    }
    this.pendingMessage = undefined;
    this.latestHiddenMessage = undefined;
    this.audit?.unregisterMessageHandler(this.receiveWebviewMessage);
    this.audit?.unregisterActiveHandler(this.replayHiddenModel);
    this.onDisposed(this);
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  private canReveal(): boolean {
    return Boolean(
      !this.isDisposed &&
        this.isReady &&
        this.webviewPanel.visible &&
        this.webviewPanel.active &&
        vscode.window.state.focused &&
        !this.isRevealed &&
         (this.maskedModel?.hasHiddenValues ?? false),
    );
  }

  private startTimer(timeoutSeconds: number): void {
    this.clearTimer();
    const generation = ++this.timerGeneration;
    this.timer = setTimeout(() => {
      if (generation === this.timerGeneration && this.isRevealed) {
        this.hide();
      }
    }, timeoutSeconds * 1000);
  }

  private clearTimer(): void {
    this.timerGeneration += 1;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private currentText(): string {
    return this.sourceText ?? this.document.getText();
  }

  private async refreshFromDisk(): Promise<void> {
    if (this.isDisposed || this.document.isDirty) {
      return;
    }
    let text: string;
    try {
      text = utf8Decoder.decode(await vscode.workspace.fs.readFile(this.document.uri));
    } catch {
      return;
    }
    if (this.isDisposed || text === this.currentText()) {
      return;
    }
    this.sourceText = text;
    this.refreshHiddenModel();
  }

  private refreshHiddenModel(): void {
    if (this.isDisposed) {
      return;
    }
    this.clearTimer();
    this.isRevealed = false;
    this.maskedModel = createMaskedEnvModel(this.currentText());
    this.documentVersion = this.document.version;
    this.revision += 1;
    this.latestHiddenMessage = {
      type: 'render',
      revision: this.revision,
      documentVersion: this.documentVersion,
      model: {
        kind: 'hidden',
        maskedText: this.maskedModel.maskedText,
        hasHiddenValues: this.maskedModel.hasHiddenValues,
        hasMultilineValues: this.maskedModel.hasMultilineValues,
        editorLabel: getEditorLabel(),
      },
    };
    this.enqueueRender(this.latestHiddenMessage, false);
  }

  private handleWebviewMessage(value: unknown): void {
    const message = parseWebviewToExtensionMessage(value);
    if (!message) {
      return;
    }
    switch (message.type) {
      case 'ready':
        this.isReady = true;
        if (this.isRevealed) {
          this.refreshHiddenModel();
        } else if (this.latestHiddenMessage) {
          this.enqueueRender(this.latestHiddenMessage, true);
        }
        return;
      case 'reveal':
        this.reveal();
        return;
      case 'hide':
      case 'focusLost':
        this.hide();
        return;
      case 'openEditor':
        void this.onOpenEditor(this);
        return;
      case 'rendered':
        if (message.revision === this.revision) {
          this.audit?.recordRendered(message.revision);
        }
    }
  }

  private enqueueRender(message: RenderMessage, force: boolean): void {
    if (this.isDisposed) {
      return;
    }
    if (
      this.pendingMessage &&
      (this.pendingMessage.revision > message.revision ||
        (!force && this.pendingMessage.revision === message.revision))
    ) {
      return;
    }
    this.pendingMessage = message;
    void this.drainRenderQueue();
  }

  private async drainRenderQueue(): Promise<void> {
    if (this.isSending || this.isDisposed || !this.pendingMessage) {
      return;
    }
    this.isSending = true;
    try {
      while (!this.isDisposed && this.pendingMessage) {
        const message = this.pendingMessage;
        this.pendingMessage = undefined;
        this.audit?.recordRender(message);
        let delivered = false;
        try {
          delivered = await this.webviewPanel.webview.postMessage(message);
        } catch {
          if (message.model.kind === 'revealed') {
            this.hide();
          }
          continue;
        }
        if (!delivered) {
          if (message.model.kind === 'revealed') {
            this.hide();
            continue;
          }
          break;
        }
        this.lastPostedRevision = Math.max(
          this.lastPostedRevision,
          message.revision,
        );
      }
    } finally {
      this.isSending = false;
      if (this.pendingMessage && !this.isDisposed) {
        void this.drainRenderQueue();
      }
    }
  }
}

export class EnvPreviewProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = protectedEnvViewType;

  private readonly sessions = new Set<PreviewSession>();
  private activeSession: PreviewSession | undefined;

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly auditRecorder: PreviewAuditRecorder | undefined,
    private readonly markIntentionalOpen: (uri: vscode.Uri) => void,
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
      (activeSession) => {
        this.activateSession(activeSession);
      },
      () => {
        this.sessions.delete(session);
        if (this.activeSession === session) {
          this.activeSession = undefined;
        }
      },
      (sessionToOpen) => sessionToOpen.openInConfiguredEditor(),
      this.auditRecorder?.requestSaveBeforeOpen ?? requestSaveBeforeOpen,
      this.markIntentionalOpen,
    );
    this.sessions.add(session);
    session.start(token);
  }

  public revealActive(): void {
    this.activeSession?.reveal();
  }

  public hideActive(): void {
    this.activeSession?.hide();
  }

  public async openActive(): Promise<void> {
    await this.activeSession?.openInConfiguredEditor();
  }

  public hideAll(): void {
    for (const session of this.sessions) {
      session.hide();
    }
  }

  public refreshEditorLabels(): void {
    for (const session of this.sessions) {
      session.refreshEditorLabel();
    }
  }

  private activateSession(session: PreviewSession): void {
    if (this.activeSession === session) {
      return;
    }
    this.activeSession?.hide();
    this.activeSession = session;
  }
}
