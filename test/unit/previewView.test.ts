import * as assert from 'node:assert/strict';
import {
  createPreviewView,
  shouldApplyRevision,
} from '../../src/webview/previewView';

suite('masked preview view', () => {
  test('creates a masked view without changing document text', () => {
    const maskedText = '# comment\nKEY="********"\nEMPTY=\n';
    assert.deepEqual(
      createPreviewView({
        kind: 'hidden',
        maskedText,
        nonEmptyValueCount: 1,
        hasMultilineValues: false,
      }),
      {
        text: maskedText,
        state: 'masked',
        status: '1 value hidden',
        canReveal: true,
        canHide: false,
      },
    );
  });

  test('creates revealed, singular, plural, and empty states', () => {
    assert.deepEqual(
      createPreviewView({
        kind: 'revealed',
        fullText: 'KEY=secret',
        nonEmptyValueCount: 1,
        hasMultilineValues: false,
      }),
      {
        text: 'KEY=secret',
        state: 'revealed',
        status: 'Values revealed',
        canReveal: false,
        canHide: true,
      },
    );
    assert.strictEqual(
      createPreviewView({
        kind: 'hidden',
        maskedText: '',
        nonEmptyValueCount: 0,
        hasMultilineValues: false,
      }).status,
      'No values to hide',
    );
    assert.strictEqual(
      createPreviewView({
        kind: 'hidden',
        maskedText: 'A=********\nB=********',
        nonEmptyValueCount: 2,
        hasMultilineValues: false,
      }).status,
      '2 values hidden',
    );
  });

  test('accepts only newer render revisions', () => {
    assert.strictEqual(shouldApplyRevision(-1, 1), true);
    assert.strictEqual(shouldApplyRevision(2, 2), false);
    assert.strictEqual(shouldApplyRevision(2, 1), false);
    assert.strictEqual(shouldApplyRevision(2, 3), true);
  });
});
