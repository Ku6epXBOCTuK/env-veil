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

function getCountdownElement(): HTMLSpanElement {
  const element = document.getElementById('countdown');
  if (!(element instanceof HTMLSpanElement)) {
    throw new Error('Preview countdown is unavailable');
  }
  return element;
}

const vscode = acquireVsCodeApi();
const preview = getPreviewElement();
const status = getStatusElement();
const body = getBodyElement();
const countdown = getCountdownElement();
const revealButton = getButtonElement('reveal-values');
const hideButton = getButtonElement('hide-values');
const openEditorButton = getButtonElement('open-editor');
let lastAppliedRevision = -1;
let lastHiddenText: string | undefined;
let lastHiddenStatus = '0 values hidden';
let revealExpiresAt: number | undefined;
let countdownTimer: ReturnType<typeof setInterval> | undefined;

function setActionState(revealed: boolean, enabled: boolean): void {
  revealButton.hidden = revealed;
  revealButton.disabled = !enabled;
  hideButton.hidden = !revealed;
  hideButton.disabled = false;
  openEditorButton.disabled = true;
}

function appendPreviewLine(
  fragment: DocumentFragment,
  rawLine: string,
  state: 'masked' | 'revealed',
): void {
  const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
  const lineElement = document.createElement('span');
  lineElement.className = 'preview-line';
  const match = /^(\s*(?:export\s+)?[^\s#=][^=]*?)(\s*=\s*)(.*)$/.exec(line);

  if (!match) {
    lineElement.textContent = line;
    fragment.append(lineElement);
    return;
  }

  const key = document.createElement('span');
  key.className = 'preview-key';
  key.textContent = match[1] ?? '';
  const operator = document.createElement('span');
  operator.className = 'preview-operator';
  operator.textContent = match[2] ?? '';
  const value = document.createElement('span');
  value.className =
    state === 'masked' ? 'preview-value preview-value-masked' : 'preview-value';
  value.textContent = match[3] ?? '';
  lineElement.append(key, operator, value);
  fragment.append(lineElement);
}

function renderDocumentText(
  text: string,
  state: 'masked' | 'revealed',
): void {
  const fragment = document.createDocumentFragment();
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    if (index > 0) {
      fragment.append(document.createTextNode('\n'));
    }
    appendPreviewLine(fragment, line, state);
  });
  preview.replaceChildren(fragment);
}

function clearCountdown(): void {
  if (countdownTimer !== undefined) {
    clearInterval(countdownTimer);
    countdownTimer = undefined;
  }
  revealExpiresAt = undefined;
  countdown.textContent = '';
  countdown.hidden = true;
}

function updateCountdown(): void {
  if (revealExpiresAt === undefined) {
    return;
  }
  const remainingSeconds = Math.max(
    0,
    Math.ceil((revealExpiresAt - Date.now()) / 1000),
  );
  countdown.textContent = remainingSeconds > 0 ? `${remainingSeconds}s` : 'Hiding…';
  if (remainingSeconds === 0 && countdownTimer !== undefined) {
    clearInterval(countdownTimer);
    countdownTimer = undefined;
  }
}

function startCountdown(expiresAt: number): void {
  clearCountdown();
  revealExpiresAt = expiresAt;
  countdown.hidden = false;
  updateCountdown();
  countdownTimer = setInterval(updateCountdown, 250);
}

function applyRender(message: ReturnType<typeof parseExtensionToWebviewMessage>): void {
  if (!message || !shouldApplyRevision(lastAppliedRevision, message.revision)) {
    return;
  }

  lastAppliedRevision = message.revision;
  const view = createPreviewView(message.model);
  if (message.model.kind === 'hidden') {
    lastHiddenText = message.model.maskedText;
    lastHiddenStatus = view.status;
  }
  renderDocumentText(view.text, view.state === 'revealed' ? 'revealed' : 'masked');
  preview.hidden = false;
  preview.setAttribute('aria-busy', 'false');
  body.dataset.state = view.state;
  status.textContent = view.status;
  setActionState(view.state === 'revealed', view.canReveal);
  if (message.model.kind === 'revealed') {
    startCountdown(message.model.revealExpiresAt);
  } else {
    clearCountdown();
  }
}

function clearOnFocusLoss(): void {
  clearCountdown();
  if (lastHiddenText !== undefined) {
    renderDocumentText(lastHiddenText, 'masked');
    preview.hidden = false;
    preview.setAttribute('aria-busy', 'false');
    body.dataset.state = 'masked';
    status.textContent = lastHiddenStatus;
  } else {
    preview.textContent = '';
    preview.hidden = false;
    preview.setAttribute('aria-busy', 'true');
    body.dataset.state = 'loading';
    status.textContent = 'Values hidden';
  }
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
