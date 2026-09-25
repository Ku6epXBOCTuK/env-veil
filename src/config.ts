import * as vscode from 'vscode';

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
