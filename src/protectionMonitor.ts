import * as path from 'node:path';
import * as vscode from 'vscode';
import { protectedEnvViewType } from './viewType';

export const showWarningMessage = 'envVeil.showProtectionWarning';

export const protectionWarningText =
  'Env Veil is not masking this file. It is open in another editor.';

export type RestoreRequest = (uri: vscode.Uri) => void;
export type WarningPresenter = (
  text: string,
  restoreLabel: string,
) => Thenable<string | undefined>;

export interface ProtectionAudit {
  readonly warnings: readonly string[];
  readonly restoreRequests: readonly string[];
  readonly associationsBefore: string;
  readonly associationsAfter: string;
  setWarningChoice(choice: string | undefined): void;
  reset(): void;
}

export class ProtectionAuditRecorder implements ProtectionAudit {
  private recordedWarnings: string[] = [];
  private recordedRestoreRequests: string[] = [];
  private snapshotBefore = '';
  private snapshotAfter = '';
  private windowReset: (() => void) | undefined;
  private warningChoice: string | undefined;

  public attachWindowReset(handler: () => void): void {
    this.windowReset = handler;
  }

  public setWarningChoice(choice: string | undefined): void {
    this.warningChoice = choice;
  }

  public getWarningChoice(): string | undefined {
    return this.warningChoice;
  }

  public recordWarning(text: string): void {
    this.recordedWarnings.push(text);
  }

  public recordRestoreRequest(uri: vscode.Uri): void {
    this.recordedRestoreRequests.push(uri.toString());
  }

  public setAssociationsSnapshot(value: string): void {
    if (this.snapshotBefore === '') {
      this.snapshotBefore = value;
    }
    this.snapshotAfter = value;
  }

  public get warnings(): readonly string[] {
    return [...this.recordedWarnings];
  }

  public get restoreRequests(): readonly string[] {
    return [...this.recordedRestoreRequests];
  }

  public get associationsBefore(): string {
    return this.snapshotBefore;
  }

  public get associationsAfter(): string {
    return this.snapshotAfter;
  }

  public reset(): void {
    this.recordedWarnings = [];
    this.recordedRestoreRequests = [];
    this.snapshotBefore = '';
    this.snapshotAfter = '';
    this.warningChoice = undefined;
    this.windowReset?.();
  }
}

export function isProtectedEnvPath(filePath: string): boolean {
  const name = path.basename(filePath).toLowerCase();
  return name === '.env' || name.startsWith('.env.');
}

function isProtectedEnvView(input: unknown): boolean {
  if (!(input instanceof vscode.TabInputCustom)) {
    return false;
  }
  return (
    input.viewType === protectedEnvViewType && isProtectedEnvPath(input.uri.fsPath)
  );
}

function getTextUris(input: unknown): readonly vscode.Uri[] {
  if (input instanceof vscode.TabInputText) {
    return [input.uri];
  }
  if (input instanceof vscode.TabInputTextDiff) {
    return [input.original, input.modified];
  }
  return [];
}

function getUnprotectedEnvTabs(): readonly vscode.Tab[] {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter((tab) => {
      const input: unknown = tab.input;
      if (isProtectedEnvView(input)) {
        return false;
      }
      return getTextUris(input).some((uri) => isProtectedEnvPath(uri.fsPath));
    });
}

function readEditorAssociations(): string {
  const value = vscode.workspace
    .getConfiguration('workbench')
    .get<unknown>('editorAssociations');
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return String(value);
  }
}

export class ProtectionMonitor implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private hasWarned = false;
  private intentionalOpenUris = new Set<string>();

  public constructor(
    private readonly audit: ProtectionAuditRecorder | undefined,
    private readonly showWarning: WarningPresenter,
    private readonly restore: RestoreRequest,
  ) {
    this.disposables.push(
      vscode.window.tabGroups.onDidChangeTabs(() => {
        void this.evaluate();
      }),
      vscode.window.onDidChangeActiveTextEditor(() => {
        void this.evaluate();
      }),
      vscode.window.onDidChangeWindowState((state) => {
        if (state.focused) {
          void this.evaluate();
        }
      }),
      vscode.commands.registerCommand(showWarningMessage, (uri: vscode.Uri) =>
        this.showWarningFor(uri, { force: true }),
      ),
    );
  }

  public markIntentionalOpen(uri: vscode.Uri): void {
    this.intentionalOpenUris.add(uri.toString());
  }

  public resetWarningState(): void {
    this.hasWarned = false;
  }

  public async evaluate(): Promise<void> {
    const unprotectedTabs = getUnprotectedEnvTabs();
    const unprotected = unprotectedTabs.filter(
      (tab) =>
        !getTextUris(tab.input).some((uri) =>
          this.intentionalOpenUris.has(uri.toString()),
        ),
    );
    if (unprotected.length === 0 || this.hasWarned) {
      return;
    }
    const input: unknown = unprotected[0]?.input;
    const uri = getTextUris(input).find((candidate) =>
      isProtectedEnvPath(candidate.fsPath),
    );
    if (uri) {
      await this.showWarningFor(uri, { force: false });
    }
  }

  private async showWarningFor(
    uri: vscode.Uri,
    options: { force: boolean },
  ): Promise<void> {
    if (!options.force && this.hasWarned) {
      return;
    }
    this.hasWarned = true;
    this.audit?.recordWarning(protectionWarningText);
    this.audit?.setAssociationsSnapshot(readEditorAssociations());
    const choice = await this.showWarning(protectionWarningText, 'Open in Env Veil');
    this.audit?.setAssociationsSnapshot(readEditorAssociations());
    if (choice === 'Open in Env Veil') {
      this.audit?.recordRestoreRequest(uri);
      this.restore(uri);
    }
  }

  public dispose(): void {
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }
}
