import * as assert from 'node:assert/strict';
import {
  parseExtensionToWebviewMessage,
  parseWebviewToExtensionMessage,
} from '../../src/messages';

suite('webview message validation', () => {
  test('accepts valid webview messages', () => {
    assert.deepEqual(parseWebviewToExtensionMessage({ type: 'ready' }), {
      type: 'ready',
    });
    assert.deepEqual(
      parseWebviewToExtensionMessage({ type: 'rendered', revision: 3 }),
      { type: 'rendered', revision: 3 },
    );
  });

  test('accepts a valid masked render message', () => {
    const message = {
      type: 'render',
      revision: 2,
      documentVersion: 7,
      model: {
        maskedText: 'KEY=********',
        nonEmptyValueCount: 1,
        hasMultilineValues: false,
      },
    };

    assert.deepEqual(parseExtensionToWebviewMessage(message), message);
  });

  test('rejects malformed webview messages', () => {
    const invalidMessages: readonly unknown[] = [
      undefined,
      null,
      [],
      {},
      { type: 'unknown' },
      { type: 'ready', revision: 1 },
      { type: 'rendered' },
      { type: 'rendered', revision: 0 },
      { type: 'rendered', revision: 1.5 },
      { type: 'rendered', revision: Number.MAX_SAFE_INTEGER + 1 },
    ];

    for (const message of invalidMessages) {
      assert.strictEqual(parseWebviewToExtensionMessage(message), undefined);
    }
  });

  test('rejects malformed masked render messages', () => {
    const validModel = {
      maskedText: 'KEY=********',
      nonEmptyValueCount: 1,
      hasMultilineValues: false,
    };
    const invalidMessages: readonly unknown[] = [
      undefined,
      { type: 'ready' },
      {
        type: 'render',
        revision: 1,
        documentVersion: 1,
        model: validModel,
        fullText: 'KEY=secret',
      },
      {
        type: 'render',
        revision: 1,
        documentVersion: 1,
        model: { ...validModel, maskedText: 42 },
      },
      {
        type: 'render',
        revision: 1,
        documentVersion: 1,
        model: { ...validModel, nonEmptyValueCount: -1 },
      },
      {
        type: 'render',
        revision: 1,
        documentVersion: 1,
        model: { ...validModel, hasMultilineValues: 'false' },
      },
    ];

    for (const message of invalidMessages) {
      assert.strictEqual(parseExtensionToWebviewMessage(message), undefined);
    }
  });
});
