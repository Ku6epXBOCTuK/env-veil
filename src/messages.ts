export interface MaskedPreviewModel {
  readonly maskedText: string;
  readonly hasHiddenValues: boolean;
  readonly hasMultilineValues: boolean;
}

export interface HiddenPreviewModel extends MaskedPreviewModel {
  readonly kind: 'hidden';
}

export interface RevealedPreviewModel {
  readonly kind: 'revealed';
  readonly fullText: string;
  readonly hasHiddenValues: boolean;
  readonly hasMultilineValues: boolean;
  readonly revealExpiresAt: number;
}

export type PreviewModel = HiddenPreviewModel | RevealedPreviewModel;

export interface ReadyMessage {
  readonly type: 'ready';
}

export interface RevealMessage {
  readonly type: 'reveal';
}

export interface HideMessage {
  readonly type: 'hide';
}

export interface FocusLostMessage {
  readonly type: 'focusLost';
}

export interface RenderedMessage {
  readonly type: 'rendered';
  readonly revision: number;
}

export interface RenderMessage {
  readonly type: 'render';
  readonly revision: number;
  readonly documentVersion: number;
  readonly model: PreviewModel;
}

export type WebviewToExtensionMessage =
  | ReadyMessage
  | RevealMessage
  | HideMessage
  | FocusLostMessage
  | RenderedMessage;
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

function isHiddenPreviewModel(value: unknown): value is HiddenPreviewModel {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'kind',
      'maskedText',
      'hasHiddenValues',
      'hasMultilineValues',
    ]) ||
    value.kind !== 'hidden'
  ) {
    return false;
  }
  return (
    typeof value.maskedText === 'string' &&
    typeof value.hasHiddenValues === 'boolean' &&
    typeof value.hasMultilineValues === 'boolean'
  );
}

function isRevealedPreviewModel(value: unknown): value is RevealedPreviewModel {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'kind',
      'fullText',
      'hasHiddenValues',
      'hasMultilineValues',
      'revealExpiresAt',
    ]) ||
    value.kind !== 'revealed'
  ) {
    return false;
  }
  return (
    typeof value.fullText === 'string' &&
    typeof value.hasHiddenValues === 'boolean' &&
    typeof value.hasMultilineValues === 'boolean' &&
    isPositiveSafeInteger(value.revealExpiresAt)
  );
}

function isPreviewModel(value: unknown): value is PreviewModel {
  return isHiddenPreviewModel(value) || isRevealedPreviewModel(value);
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
  if (value.type === 'reveal' && hasExactKeys(value, ['type'])) {
    return { type: 'reveal' };
  }
  if (value.type === 'hide' && hasExactKeys(value, ['type'])) {
    return { type: 'hide' };
  }
  if (value.type === 'focusLost' && hasExactKeys(value, ['type'])) {
    return { type: 'focusLost' };
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
    !isPreviewModel(value.model)
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
