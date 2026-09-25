import {
  parseExtensionToWebviewMessage,
  type WebviewToExtensionMessage,
} from '../messages';
import { createPreviewView, shouldApplyRevision } from './previewView';

interface VsCodeApi {
  postMessage(message: WebviewToExtensionMessage): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

function getPreviewElement(): HTMLPreElement {
  const element = document.getElementById('preview');
  if (!(element instanceof HTMLPreElement)) {
    throw new Error('Masked preview element is unavailable');
  }
  return element;
}

function getStatusElement(): HTMLSpanElement {
  const element = document.getElementById('status');
  if (!(element instanceof HTMLSpanElement)) {
    throw new Error('Preview status element is unavailable');
  }
  return element;
}

function getBodyElement(): HTMLBodyElement {
  if (!(document.body instanceof HTMLBodyElement)) {
    throw new Error('Preview body is unavailable');
  }
  return document.body;
}

const vscode = acquireVsCodeApi();
let lastAppliedRevision = -1;

function applyRender(message: ReturnType<typeof parseExtensionToWebviewMessage>): void {
  if (!message || !shouldApplyRevision(lastAppliedRevision, message.revision)) {
    return;
  }

  lastAppliedRevision = message.revision;
  const view = createPreviewView(message.model);
  const preview = getPreviewElement();
  const status = getStatusElement();
  const body = getBodyElement();
  preview.textContent = view.maskedText;
  preview.setAttribute('aria-busy', 'false');
  body.dataset.state = view.state;
  status.textContent = view.status;

  requestAnimationFrame(() => {
    if (lastAppliedRevision === message.revision) {
      vscode.postMessage({
        type: 'rendered',
        revision: message.revision,
      });
    }
  });
}

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  applyRender(parseExtensionToWebviewMessage(event.data));
});

vscode.postMessage({ type: 'ready' });
