import spawn from 'cross-spawn';
import {
  getExternalEditorSettings,
  type ExternalEditorSettings,
} from './config';

export interface ExternalEditorLaunchOptions {
  readonly filePath: string;
  readonly workspaceFolder?: string;
}

export function resolveExternalEditorArgs(
  args: readonly string[],
  filePath: string,
  workspaceFolder?: string,
): string[] {
  let hasFilePlaceholder = false;
  const resolved = args.map((argument) => {
    if (argument.includes('{file}')) {
      hasFilePlaceholder = true;
      return argument.replaceAll('{file}', filePath);
    }
    if (argument.includes('{workspaceFolder}')) {
      return argument.replaceAll('{workspaceFolder}', workspaceFolder ?? '');
    }
    return argument;
  });
  if (!hasFilePlaceholder) {
    resolved.push(filePath);
  }
  return resolved;
}

function getLaunchOptions(workspaceFolder?: string) {
  return {
    shell: false,
    stdio: 'ignore' as const,
    windowsHide: true,
    ...(workspaceFolder ? { cwd: workspaceFolder } : {}),
  };
}

const launchFailureCodes = new Set(['ENOENT', 'ENOTDIR', 'EACCES']);
const launchConfirmationMilliseconds = 400;

function isLaunchFailure(error: Error): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code !== undefined && launchFailureCodes.has(code);
}

export async function launchExternalEditor(
  options: ExternalEditorLaunchOptions,
  settings: ExternalEditorSettings = getExternalEditorSettings(),
): Promise<void> {
  if (!settings.command) {
    throw new Error('External editor command is not configured');
  }
  const args = resolveExternalEditorArgs(
    settings.args,
    options.filePath,
    options.workspaceFolder,
  );
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      settings.command,
      args,
      getLaunchOptions(options.workspaceFolder),
    );
    let settled = false;
    let spawned = false;
    let confirmationTimer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = (): void => {
      if (confirmationTimer !== undefined) {
        clearTimeout(confirmationTimer);
        confirmationTimer = undefined;
      }
      child.removeListener('error', handleError);
      child.removeListener('exit', handleExit);
    };
    const succeed = (): void => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve();
      }
    };
    const fail = (error: Error): void => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(error);
      }
    };
    function handleError(error: Error): void {
      if (!settled && isLaunchFailure(error)) {
        fail(error);
      }
    }
    function handleExit(code: number | null): void {
      if (!settled && spawned && code !== 0) {
        fail(new Error(`External editor exited with code ${code}`));
      }
    }
    child.on('error', handleError);
    child.on('exit', handleExit);
    child.once('spawn', () => {
      spawned = true;
      confirmationTimer = setTimeout(succeed, launchConfirmationMilliseconds);
    });
  });
}
