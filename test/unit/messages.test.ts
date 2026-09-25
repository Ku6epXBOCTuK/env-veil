import * as assert from 'node:assert/strict';
import {
  parseExtensionToWebviewMessage,
  parseWebviewToExtensionMessage,
} from '../../src/messages';

suite('webview message validation', () => {
  test('accepts valid webview messages', () => {
    const messages = [
      { type: 'ready' },
      { type: 'reveal' },
      { type: 'hide' },
      { type: 'focusLost' },
    ] as const;
    for (const message of messages) {
      assert.deepEqual(parseWebviewToExtensionMessage(message), message);
    }
    assert.deepEqual(
      parseWebviewToExtensionMessage({ type: 'rendered', revision: 3 }),
      { type: 'rendered', revision: 3 },
    );
  });

  test('accepts valid hidden and revealed render messages', () => {
    const hiddenMessage = {
      type: 'render',
      revision: 2,
      documentVersion: 7,
      model: {
        kind: 'hidden',
        maskedText: 'KEY=********',
        hasHiddenValues: true,
        hasMultilineValues: false,
      },
    };
    const revealedMessage = {
      type: 'render',
      revision: 3,
      documentVersion: 7,
      model: {
        kind: 'revealed',
        fullText: 'KEY=secret',
        hasHiddenValues: true,
        hasMultilineValues: false,
        revealExpiresAt: 123456,
      },
    };

    assert.deepEqual(parseExtensionToWebviewMessage(hiddenMessage), hiddenMessage);
    assert.deepEqual(
      parseExtensionToWebviewMessage(revealedMessage),
      revealedMessage,
    );
  });

  test('rejects malformed webview messages', () => {
    const invalidMessages: readonly unknown[] = [
      undefined,
      null,
      [],
      {},
      { type: 'unknown' },
      { type: 'ready', revision: 1 },
      { type: 'reveal', revision: 1 },
      { type: 'hide', revision: 1 },
      { type: 'focusLost', revision: 1 },
      { type: 'rendered' },
      { type: 'rendered', revision: 0 },
      { type: 'rendered', revision: 1.5 },
      { type: 'rendered', revision: Number.MAX_SAFE_INTEGER + 1 },
    ];

    for (const message of invalidMessages) {
      assert.strictEqual(parseWebviewToExtensionMessage(message), undefined);
    }
  });

  test('rejects mismatched or extra render fields', () => {
    const hiddenModel = {
      kind: 'hidden',
      maskedText: 'KEY=********',
      hasHiddenValues: true,
      hasMultilineValues: false,
    };
    const invalidMessages: readonly unknown[] = [
      undefined,
      { type: 'ready' },
      {
        type: 'render',
        revision: 1,
        documentVersion: 1,
        model: hiddenModel,
        fullText: 'KEY=secret',
      },
      {
        type: 'render',
        revision: 1,
        documentVersion: 1,
        model: { ...hiddenModel, kind: 'revealed' },
      },
      {
        type: 'render',
        revision: 1,
        documentVersion: 1,
        model: { ...hiddenModel, maskedText: 42 },
      },
      {
        type: 'render',
        revision: 1,
        documentVersion: 1,
        model: { ...hiddenModel, hasHiddenValues: 'yes' },
      },
      {
        type: 'render',
        revision: 1,
        documentVersion: 1,
        model: { ...hiddenModel, hasMultilineValues: 'false' },
      },
      {
        type: 'render',
        revision: 1,
        documentVersion: 1,
        model: {
          kind: 'revealed',
          hasHiddenValues: true,
          hasMultilineValues: false,
        },
      },
    ];

    for (const message of invalidMessages) {
      assert.strictEqual(parseExtensionToWebviewMessage(message), undefined);
    }
  });
});
