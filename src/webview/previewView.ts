import type { PreviewModel } from '../messages';

export type PreviewState = 'empty' | 'masked' | 'revealed';

export interface PreviewView {
  readonly text: string;
  readonly state: PreviewState;
  readonly status: string;
  readonly canReveal: boolean;
  readonly canHide: boolean;
}

export function createPreviewView(model: PreviewModel): PreviewView {
  if (model.kind === 'revealed') {
    return {
      text: model.fullText,
      state: 'revealed',
      status: 'Values revealed',
      canReveal: false,
      canHide: true,
    };
  }

  return {
    text: model.maskedText,
    state: model.nonEmptyValueCount === 0 ? 'empty' : 'masked',
    status:
      model.nonEmptyValueCount === 0
        ? 'No values to hide'
        : `${model.nonEmptyValueCount} ${
            model.nonEmptyValueCount === 1 ? 'value' : 'values'
          } hidden`,
    canReveal: model.nonEmptyValueCount > 0,
    canHide: false,
  };
}

export function shouldApplyRevision(
  lastAppliedRevision: number,
  incomingRevision: number,
): boolean {
  return incomingRevision > lastAppliedRevision;
}
