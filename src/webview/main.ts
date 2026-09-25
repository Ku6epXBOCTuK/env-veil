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

function getButtonElement(id: string): HTMLButtonElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`Preview button is unavailable: ${id}`);
  }
  return element;
}

const vscode = acquireVsCodeApi();
const preview = getPreviewElement();
const status = getStatusElement();
const body = getBodyElement();
const revealButton = getButtonElement('reveal-values');
const hideButton = getButtonElement('hide-values');
let lastAppliedRevision = -1;

function setActionState(revealed: boolean, enabled: boolean): void {
  revealButton.hidden = revealed;
  revealButton.disabled = !enabled;
  hideButton.hidden = !revealed;
  hideButton.disabled = false;
}

function applyRender(message: ReturnType<typeof parseExtensionToWebviewMessage>): void {
  if (!message || !shouldApplyRevision(lastAppliedRevision, message.revision)) {
    return;
  }

  lastAppliedRevision = message.revision;
  const view = createPreviewView(message.model);
  preview.textContent = view.text;
  preview.setAttribute('aria-busy', 'false');
  body.dataset.state = view.state;
  status.textContent = view.status;
  setActionState(view.state === 'revealed', view.canReveal);
}

function clearOnFocusLoss(): void {
  preview.textContent = '';
  preview.setAttribute('aria-busy', 'true');
  body.dataset.state = 'loading';
  status.textContent = 'Values hidden';
  setActionState(false, false);
  vscode.postMessage({ type: 'focusLost' });
}

revealButton.addEventListener('click', () => {
  vscode.postMessage({ type: 'reveal' });
});

hideButton.addEventListener('click', () => {
  vscode.postMessage({ type: 'hide' });
});

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  applyRender(parseExtensionToWebviewMessage(event.data));
});

window.addEventListener('blur', clearOnFocusLoss);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') {
    clearOnFocusLoss();
  }
});

vscode.postMessage({ type: 'ready' });
