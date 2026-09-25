import * as assert from 'node:assert/strict';
import {
  createPreviewView,
  shouldApplyRevision,
} from '../../src/webview/previewView';

suite('masked preview view', () => {
  test('creates a masked view without changing document text', () => {
    const maskedText = '# comment\nKEY="********"\nEMPTY=********\n';
    assert.deepEqual(
      createPreviewView({
        kind: 'hidden',
        maskedText,
        hasHiddenValues: true,
        hasMultilineValues: false,
        editorLabel: 'VS Code',
      }),
      {
        text: maskedText,
        state: 'masked',
        status: 'Values hidden',
        canReveal: true,
        canHide: false,
         countdownSeconds: null,
         editorLabel: 'VS Code',
       },
    );
  });

  test('creates revealed, singular, plural, and zero-value states', () => {
    assert.deepEqual(
      createPreviewView({
        kind: 'revealed',
        fullText: 'KEY=secret',
        hasHiddenValues: true,
        hasMultilineValues: false,
        editorLabel: 'VS Code',
        revealExpiresAt: 6000,
      }, 1000),
      {
        text: 'KEY=secret',
        state: 'revealed',
        status: 'Values revealed',
        canReveal: false,
        canHide: true,
         countdownSeconds: 5,
         editorLabel: 'VS Code',
       },
    );
    assert.deepEqual(
      createPreviewView({
        kind: 'hidden',
        maskedText: '',
        hasHiddenValues: false,
        hasMultilineValues: false,
        editorLabel: 'VS Code',
      }),
      {
        text: '',
        state: 'masked',
        status: 'Protected preview',
        canReveal: false,
        canHide: false,
         countdownSeconds: null,
         editorLabel: 'VS Code',
       },
    );
    assert.strictEqual(
      createPreviewView({
        kind: 'hidden',
        maskedText: 'A=********\nB=********',
        hasHiddenValues: true,
        hasMultilineValues: false,
        editorLabel: 'VS Code',
      }).status,
      'Values hidden',
    );
  });

  test('accepts only newer render revisions', () => {
    assert.strictEqual(shouldApplyRevision(-1, 1), true);
    assert.strictEqual(shouldApplyRevision(2, 2), false);
    assert.strictEqual(shouldApplyRevision(2, 1), false);
    assert.strictEqual(shouldApplyRevision(2, 3), true);
  });
});
