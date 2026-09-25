import type { PreviewModel } from '../messages';

export type PreviewState = 'masked' | 'revealed';

export interface PreviewView {
  readonly text: string;
  readonly state: PreviewState;
  readonly status: string;
  readonly canReveal: boolean;
  readonly canHide: boolean;
  readonly countdownSeconds: number | null;
  readonly editorLabel: string;
}

export function createPreviewView(
  model: PreviewModel,
  nowMs = Date.now(),
): PreviewView {
  if (model.kind === 'revealed') {
    return {
      text: model.fullText,
      state: 'revealed',
      status: 'Values revealed',
      canReveal: false,
      canHide: true,
      countdownSeconds: Math.max(
        0,
        Math.ceil((model.revealExpiresAt - nowMs) / 1000),
      ),
      editorLabel: model.editorLabel,
    };
  }

  return {
    text: model.maskedText,
    state: 'masked',
    status: model.hasHiddenValues ? 'Values hidden' : 'Protected preview',
    canReveal: model.hasHiddenValues,
    canHide: false,
    countdownSeconds: null,
    editorLabel: model.editorLabel,
  };
}

export function shouldApplyRevision(
  lastAppliedRevision: number,
  incomingRevision: number,
): boolean {
  return incomingRevision > lastAppliedRevision;
}
