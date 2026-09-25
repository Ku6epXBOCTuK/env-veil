export const MASKED_VALUE = '********';

export interface MaskedEnvModel {
  readonly maskedText: string;
  readonly hasHiddenValues: boolean;
  readonly hasMultilineValues: boolean;
}

interface ScanContext {
  hasHiddenValues: boolean;
  hasMultilineValues: boolean;
}

interface ScanResult {
  readonly text: string;
  readonly nextIndex: number;
}

interface QuotedScanResult extends ScanResult {
  readonly closed: boolean;
}

function isHorizontalWhitespace(character: string | undefined): boolean {
  return character === ' ' || character === '\t';
}

function getLineBreakLength(text: string, index: number): number {
  if (text[index] === '\r') {
    return text[index + 1] === '\n' ? 2 : 1;
  }
  return text[index] === '\n' ? 1 : 0;
}

function copyLine(text: string, index: number): ScanResult {
  let endIndex = index;
  while (endIndex < text.length && getLineBreakLength(text, endIndex) === 0) {
    endIndex += 1;
  }
  const lineBreakLength = getLineBreakLength(text, endIndex);
  if (lineBreakLength > 0) {
    endIndex += lineBreakLength;
  }
  return {
    text: text.slice(index, endIndex),
    nextIndex: endIndex,
  };
}

function maskMalformedLine(
  text: string,
  index: number,
  context: ScanContext,
): ScanResult {
  context.hasHiddenValues = true;
  let endIndex = index;
  while (endIndex < text.length && getLineBreakLength(text, endIndex) === 0) {
    endIndex += 1;
  }
  const lineBreakLength = getLineBreakLength(text, endIndex);
  const lineBreak = text.slice(endIndex, endIndex + lineBreakLength);
  return {
    text: MASKED_VALUE + lineBreak,
    nextIndex: endIndex + lineBreakLength,
  };
}

function scanQuotedValue(
  text: string,
  index: number,
  quote: "'" | '"' | '`',
  context: ScanContext,
): QuotedScanResult {
  let currentIndex = index;
  let output = '';
  let hasContent = false;

  const ensureMask = (): void => {
    if (!hasContent) {
      hasContent = true;
      context.hasHiddenValues = true;
      output += MASKED_VALUE;
    }
  };

  while (currentIndex < text.length) {
    const character = text[currentIndex];
    if (character === quote) {
      if (!hasContent) {
        hasContent = true;
        context.hasHiddenValues = true;
        output += MASKED_VALUE;
      }
      return {
        text: output,
        nextIndex: currentIndex + 1,
        closed: true,
      };
    }
    if (character === '\\') {
      ensureMask();
      const lineBreakLength = getLineBreakLength(text, currentIndex + 1);
      if (lineBreakLength > 0) {
        context.hasMultilineValues = true;
        output += '\\' + text.slice(currentIndex + 1, currentIndex + 1 + lineBreakLength);
        currentIndex += 1 + lineBreakLength;
      } else {
        currentIndex += Math.min(2, text.length - currentIndex);
      }
      continue;
    }
    const lineBreakLength = getLineBreakLength(text, currentIndex);
    if (lineBreakLength > 0) {
      ensureMask();
      context.hasMultilineValues = true;
      output += text.slice(currentIndex, currentIndex + lineBreakLength);
      currentIndex += lineBreakLength;
      continue;
    }
    ensureMask();
    currentIndex += 1;
  }

  if (!hasContent) {
    context.hasHiddenValues = true;
    output += MASKED_VALUE;
  }

  return {
    text: output,
    nextIndex: currentIndex,
    closed: false,
  };
}

function scanUnquotedValue(
  text: string,
  index: number,
  context: ScanContext,
): ScanResult {
  let currentIndex = index;
  let output = '';
  let hasContent = false;
  let pendingWhitespaceStart = -1;

  const ensureMask = (): void => {
    if (!hasContent) {
      hasContent = true;
      context.hasHiddenValues = true;
      output += MASKED_VALUE;
    }
  };

  while (currentIndex < text.length) {
    const lineBreakLength = getLineBreakLength(text, currentIndex);
    if (lineBreakLength > 0) {
      return {
        text: output + text.slice(currentIndex, currentIndex + lineBreakLength),
        nextIndex: currentIndex + lineBreakLength,
      };
    }

    const character = text[currentIndex];
    if (isHorizontalWhitespace(character)) {
      ensureMask();
      if (pendingWhitespaceStart < 0) {
        pendingWhitespaceStart = currentIndex;
      }
      currentIndex += 1;
      continue;
    }

    if (character === '#') {
      if (pendingWhitespaceStart >= 0) {
        const separator = text.slice(pendingWhitespaceStart, currentIndex);
        const comment = copyLine(text, currentIndex);
        return {
          text: output + separator + comment.text,
          nextIndex: comment.nextIndex,
        };
      }
      ensureMask();
      let endIndex = currentIndex + 1;
      while (endIndex < text.length && getLineBreakLength(text, endIndex) === 0) {
        endIndex += 1;
      }
      const lineBreakLength = getLineBreakLength(text, endIndex);
      return {
        text: output + text.slice(endIndex, endIndex + lineBreakLength),
        nextIndex: endIndex + lineBreakLength,
      };
    }

    if (character === '\\') {
      ensureMask();
      const continuedLineBreakLength = getLineBreakLength(text, currentIndex + 1);
      if (continuedLineBreakLength > 0) {
        context.hasMultilineValues = true;
        output +=
          '\\' +
          text.slice(
            currentIndex + 1,
            currentIndex + 1 + continuedLineBreakLength,
          );
        currentIndex += 1 + continuedLineBreakLength;
      } else {
        currentIndex += Math.min(2, text.length - currentIndex);
      }
      pendingWhitespaceStart = -1;
      continue;
    }

    ensureMask();
    pendingWhitespaceStart = -1;
    currentIndex += 1;
  }

  return {
    text: output,
    nextIndex: currentIndex,
  };
}

function scanQuotedSuffix(text: string, index: number): ScanResult {
  let currentIndex = index;
  while (isHorizontalWhitespace(text[currentIndex])) {
    currentIndex += 1;
  }

  const lineBreakLength = getLineBreakLength(text, currentIndex);
  if (lineBreakLength > 0) {
    return {
      text: text.slice(index, currentIndex + lineBreakLength),
      nextIndex: currentIndex + lineBreakLength,
    };
  }
  if (currentIndex >= text.length) {
    return {
      text: text.slice(index, currentIndex),
      nextIndex: currentIndex,
    };
  }
  if (text[currentIndex] === '#' && currentIndex > index) {
    const comment = copyLine(text, currentIndex);
    return {
      text: text.slice(index, currentIndex) + comment.text,
      nextIndex: comment.nextIndex,
    };
  }

  let endIndex = currentIndex;
  while (endIndex < text.length && getLineBreakLength(text, endIndex) === 0) {
    endIndex += 1;
  }
  const suffixLineBreakLength = getLineBreakLength(text, endIndex);
  return {
    text: text.slice(endIndex, endIndex + suffixLineBreakLength),
    nextIndex: endIndex + suffixLineBreakLength,
  };
}

function scanAssignment(
  text: string,
  index: number,
  context: ScanContext,
): ScanResult {
  const assignmentStart = index;
  let currentIndex = index;

  if (
    text.startsWith('export', currentIndex) &&
    isHorizontalWhitespace(text[currentIndex + 'export'.length])
  ) {
    currentIndex += 'export'.length;
    while (isHorizontalWhitespace(text[currentIndex])) {
      currentIndex += 1;
    }
  }

  const keyStart = currentIndex;
  while (currentIndex < text.length) {
    const character = text[currentIndex];
    if (
      character === '=' ||
      isHorizontalWhitespace(character) ||
      getLineBreakLength(text, currentIndex) > 0
    ) {
      break;
    }
    if (
      character === '#' ||
      character === "'" ||
      character === '"' ||
      character === '`'
    ) {
      return maskMalformedLine(text, assignmentStart, context);
    }
    currentIndex += 1;
  }
  if (currentIndex === keyStart) {
    return maskMalformedLine(text, assignmentStart, context);
  }

  while (isHorizontalWhitespace(text[currentIndex])) {
    currentIndex += 1;
  }
  if (text[currentIndex] !== '=') {
    return maskMalformedLine(text, assignmentStart, context);
  }
  currentIndex += 1;

  const whitespaceStart = currentIndex;
  while (isHorizontalWhitespace(text[currentIndex])) {
    currentIndex += 1;
  }
  const prefix = text.slice(assignmentStart, currentIndex);
  const hasPostEqualsWhitespace = currentIndex > whitespaceStart;

  const lineBreakLength = getLineBreakLength(text, currentIndex);
  if (lineBreakLength > 0) {
    context.hasHiddenValues = true;
    return {
      text: prefix + MASKED_VALUE + text.slice(currentIndex, currentIndex + lineBreakLength),
      nextIndex: currentIndex + lineBreakLength,
    };
  }
  if (currentIndex >= text.length) {
    context.hasHiddenValues = true;
    return {
      text: prefix + MASKED_VALUE,
      nextIndex: currentIndex,
    };
  }

  const firstValueCharacter = text[currentIndex];
  if (firstValueCharacter === '#' && hasPostEqualsWhitespace) {
    context.hasHiddenValues = true;
    const comment = copyLine(text, currentIndex);
    return {
      text: prefix + MASKED_VALUE + ' ' + comment.text,
      nextIndex: comment.nextIndex,
    };
  }

  if (
    firstValueCharacter === "'" ||
    firstValueCharacter === '"' ||
    firstValueCharacter === '`'
  ) {
    const quote = firstValueCharacter;
    const quotedValue = scanQuotedValue(
      text,
      currentIndex + 1,
      quote,
      context,
    );
    if (!quotedValue.closed) {
      return {
        text: prefix + quote + quotedValue.text,
        nextIndex: quotedValue.nextIndex,
      };
    }
    const suffix = scanQuotedSuffix(text, quotedValue.nextIndex);
    return {
      text: prefix + quote + quotedValue.text + quote + suffix.text,
      nextIndex: suffix.nextIndex,
    };
  }

  const unquotedValue = scanUnquotedValue(text, currentIndex, context);
  return {
    text: prefix + unquotedValue.text,
    nextIndex: unquotedValue.nextIndex,
  };
}

export function createMaskedEnvModel(text: string): MaskedEnvModel {
  const context: ScanContext = {
    hasHiddenValues: false,
    hasMultilineValues: false,
  };
  let output = '';
  let index = 0;

  if (text.startsWith('\uFEFF')) {
    output += '\uFEFF';
    index = 1;
  }

  while (index < text.length) {
    const leadingWhitespaceStart = index;
    while (isHorizontalWhitespace(text[index])) {
      index += 1;
    }
    output += text.slice(leadingWhitespaceStart, index);

    const lineBreakLength = getLineBreakLength(text, index);
    if (lineBreakLength > 0) {
      output += text.slice(index, index + lineBreakLength);
      index += lineBreakLength;
      continue;
    }
    if (index >= text.length) {
      break;
    }
    if (text[index] === '#') {
      const comment = copyLine(text, index);
      output += comment.text;
      index = comment.nextIndex;
      continue;
    }

    const assignment = scanAssignment(text, index, context);
    output += assignment.text;
    index = assignment.nextIndex;
  }

  return {
    maskedText: output,
    hasHiddenValues: context.hasHiddenValues,
    hasMultilineValues: context.hasMultilineValues,
  };
}
