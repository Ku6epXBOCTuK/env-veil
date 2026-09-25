import * as path from 'node:path';
import * as vscode from 'vscode';

export type OpenInMode = 'vscode' | 'external';

export interface ExternalEditorSettings {
  readonly command: string;
  readonly args: readonly string[];
}

export const defaultRevealTimeoutSeconds = 15;
export const minimumRevealTimeoutSeconds = 1;
export const maximumRevealTimeoutSeconds = 3600;

export function getRevealTimeoutSeconds(): number {
  const value = vscode.workspace
    .getConfiguration('envVeil')
    .get<unknown>('revealTimeoutSeconds', defaultRevealTimeoutSeconds);
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < minimumRevealTimeoutSeconds ||
    value > maximumRevealTimeoutSeconds
  ) {
    return defaultRevealTimeoutSeconds;
  }
  return value;
}

export function getOpenInMode(): OpenInMode {
  const value = vscode.workspace
    .getConfiguration('envVeil')
    .get<unknown>('openIn.mode', 'vscode');
  return value === 'external' ? 'external' : 'vscode';
}

function getMachineValue<T>(key: string, fallback: T): T {
  const inspected = vscode.workspace
    .getConfiguration('envVeil')
    .inspect<T>(key);
  return inspected?.globalValue ?? inspected?.defaultValue ?? fallback;
}

export function getExternalEditorSettings(): ExternalEditorSettings {
  const commandValue = getMachineValue<unknown>('externalEditor.command', '');
  const argsValue = getMachineValue<unknown>('externalEditor.args', []);
  const command =
    typeof commandValue === 'string' &&
    !commandValue.includes('\0') &&
    commandValue.trim().length > 0
      ? commandValue.trim()
      : '';
  const args = Array.isArray(argsValue)
    ? argsValue.filter(
        (value): value is string =>
          typeof value === 'string' && !value.includes('\0'),
      )
    : [];
  return { command, args };
}

export function getEditorLabel(): string {
  if (getOpenInMode() === 'vscode') {
    return 'VS Code';
  }
  const command = getExternalEditorSettings().command;
  return command ? `External: ${path.basename(command)}` : 'External editor';
}
