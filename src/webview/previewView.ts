import type { MaskedPreviewModel } from '../messages';

export type PreviewState = 'empty' | 'masked';

export interface PreviewView {
  readonly maskedText: string;
  readonly state: PreviewState;
  readonly status: string;
}

export function createPreviewView(model: MaskedPreviewModel): PreviewView {
  return {
    maskedText: model.maskedText,
    state: model.nonEmptyValueCount === 0 ? 'empty' : 'masked',
    status:
      model.nonEmptyValueCount === 0
        ? 'No values to hide'
        : `${model.nonEmptyValueCount} ${
            model.nonEmptyValueCount === 1 ? 'value' : 'values'
          } hidden`,
  };
}

export function shouldApplyRevision(
  lastAppliedRevision: number,
  incomingRevision: number,
): boolean {
  return incomingRevision > lastAppliedRevision;
}
