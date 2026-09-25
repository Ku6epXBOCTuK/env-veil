export interface MaskedPreviewModel {
  readonly maskedText: string;
  readonly nonEmptyValueCount: number;
  readonly hasMultilineValues: boolean;
}

export interface ReadyMessage {
  readonly type: 'ready';
}

export interface RenderedMessage {
  readonly type: 'rendered';
  readonly revision: number;
}

export interface RenderMessage {
  readonly type: 'render';
  readonly revision: number;
  readonly documentVersion: number;
  readonly model: MaskedPreviewModel;
}

export type WebviewToExtensionMessage = ReadyMessage | RenderedMessage;
export type ExtensionToWebviewMessage = RenderMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value);
  return (
    actualKeys.length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isMaskedPreviewModel(value: unknown): value is MaskedPreviewModel {
  if (!isRecord(value) || !hasExactKeys(value, [
    'maskedText',
    'nonEmptyValueCount',
    'hasMultilineValues',
  ])) {
    return false;
  }
  return (
    typeof value.maskedText === 'string' &&
    isNonNegativeSafeInteger(value.nonEmptyValueCount) &&
    typeof value.hasMultilineValues === 'boolean'
  );
}

export function parseWebviewToExtensionMessage(
  value: unknown,
): WebviewToExtensionMessage | undefined {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return undefined;
  }

  if (value.type === 'ready' && hasExactKeys(value, ['type'])) {
    return { type: 'ready' };
  }

  if (
    value.type === 'rendered' &&
    hasExactKeys(value, ['type', 'revision']) &&
    isPositiveSafeInteger(value.revision)
  ) {
    return {
      type: 'rendered',
      revision: value.revision,
    };
  }

  return undefined;
}

export function parseExtensionToWebviewMessage(
  value: unknown,
): ExtensionToWebviewMessage | undefined {
  if (
    !isRecord(value) ||
    value.type !== 'render' ||
    !hasExactKeys(value, ['type', 'revision', 'documentVersion', 'model']) ||
    !isPositiveSafeInteger(value.revision) ||
    !isPositiveSafeInteger(value.documentVersion) ||
    !isMaskedPreviewModel(value.model)
  ) {
    return undefined;
  }

  return {
    type: 'render',
    revision: value.revision,
    documentVersion: value.documentVersion,
    model: value.model,
  };
}
