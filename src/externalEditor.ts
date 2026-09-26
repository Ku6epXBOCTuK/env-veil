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
const runningEditorTimeoutMilliseconds = 2000;

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
    let runningTimer: ReturnType<typeof setTimeout> | undefined;
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
    const cleanup = (): void => {
      if (runningTimer !== undefined) {
        clearTimeout(runningTimer);
        runningTimer = undefined;
      }
    };
    child.once('error', (error: Error) => {
      if (isLaunchFailure(error)) {
        fail(error);
      }
    });
    child.once('exit', (code) => {
      if (code === 0) {
        succeed();
      } else {
        fail(new Error(`External editor exited with code ${code}`));
      }
    });
    child.once('spawn', () => {
      runningTimer = setTimeout(
        succeed,
        runningEditorTimeoutMilliseconds,
      );
    });
  });
}
