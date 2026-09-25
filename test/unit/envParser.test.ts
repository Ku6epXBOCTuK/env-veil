import * as assert from 'node:assert/strict';
import {
  createMaskedEnvModel,
  MASKED_VALUE,
} from '../../src/envParser';

function assertModel(
  input: string,
  expectedText: string,
  expectedHasHiddenValues: boolean,
  expectedHasMultilineValues = false,
): void {
  assert.deepEqual(createMaskedEnvModel(input), {
    maskedText: expectedText,
    hasHiddenValues: expectedHasHiddenValues,
    hasMultilineValues: expectedHasMultilineValues,
  });
}

suite('createMaskedEnvModel', () => {
  test('preserves structure and masks common assignments', () => {
    assertModel(
      '# comment\n  export  API_KEY = secret\nexport=export-secret\nexportKEY=other\nA-B.C:VALUE=weird',
      `# comment\n  export  API_KEY = ${MASKED_VALUE}\nexport=${MASKED_VALUE}\nexportKEY=${MASKED_VALUE}\nA-B.C:VALUE=${MASKED_VALUE}`,
       true,
    );
  });

  test('masks empty and quoted-empty values', () => {
    assertModel(
      'EMPTY=\nSPACES= \t\nCOMMENT= # visible\nSINGLE=\'\'\nDOUBLE=""\nBACKTICK=``',
      `EMPTY=${MASKED_VALUE}\nSPACES= \t${MASKED_VALUE}\nCOMMENT= ${MASKED_VALUE} # visible\nSINGLE='${MASKED_VALUE}'\nDOUBLE="${MASKED_VALUE}"\nBACKTICK=\`${MASKED_VALUE}\``,
       true,
    );
  });

  test('distinguishes quoted whitespace and ambiguous hash values', () => {
    assertModel(
      'SPACE=" "\nHASH=# ambiguous',
      `SPACE="${MASKED_VALUE}"\nHASH=${MASKED_VALUE}`,
       true,
    );
  });

  test('masks all supported quote styles and escaped quotes', () => {
    assertModel(
      'SINGLE=\'it\\\'s\'\nDOUBLE="a\\"b"\nBACKTICK=`a\\`b`\nHASH="a#b"\nUNQUOTED=foo"bar"',
      `SINGLE='${MASKED_VALUE}'\nDOUBLE="${MASKED_VALUE}"\nBACKTICK=\`${MASKED_VALUE}\`\nHASH="${MASKED_VALUE}"\nUNQUOTED=${MASKED_VALUE}`,
       true,
    );
  });

  test('preserves only unambiguous inline comments', () => {
    assertModel(
      'PLAIN=secret # comment\nGLUED=secret#not-comment\nESCAPED=secret \\# still-value\nQUOTED="secret" # comment\nQUOTED_GLUE="secret"#not-comment\nQUOTED_BAD="secret"junk',
      `PLAIN=${MASKED_VALUE} # comment\nGLUED=${MASKED_VALUE}\nESCAPED=${MASKED_VALUE}\nQUOTED="${MASKED_VALUE}" # comment\nQUOTED_GLUE="${MASKED_VALUE}"\nQUOTED_BAD="${MASKED_VALUE}"`,
       true,
    );
  });

  test('masks quoted and backslash-continued multiline values', () => {
    assertModel(
      'QUOTED="one\n# two\nthree"\nNEXT=secret\nCONTINUED=one\\\ntwo\nTHIRD=value\nESCAPED="one\\\ntwo"',
      `QUOTED="${MASKED_VALUE}\n\n"\nNEXT=${MASKED_VALUE}\nCONTINUED=${MASKED_VALUE}\\\n\nTHIRD=${MASKED_VALUE}\nESCAPED="${MASKED_VALUE}\\\n"`,
       true,
      true,
    );
  });

  test('preserves BOM, CRLF, and multiline structure', () => {
    assertModel(
      '\uFEFF# comment\r\nKEY=secret\r\nEMPTY=\r\nQUOTED="a\r\nb"\r\n',
      `\uFEFF# comment\r\nKEY=${MASKED_VALUE}\r\nEMPTY=${MASKED_VALUE}\r\nQUOTED="${MASKED_VALUE}\r\n"\r\n`,
        true,
       true,
    );
  });

  test('masks malformed lines and unterminated quoted regions', () => {
    assertModel(
      'A B=secret\nA#B=secret\nA"B=secret\nMISSING\nOPEN="one\nOTHER=secret',
      `${MASKED_VALUE}\n${MASKED_VALUE}\n${MASKED_VALUE}\n${MASKED_VALUE}\nOPEN="${MASKED_VALUE}\n`,
       true,
      true,
    );
  });

  test('uses a fixed mask independent of value length', () => {
    const shortModel = createMaskedEnvModel('KEY=a');
    const longModel = createMaskedEnvModel(
      'KEY=a-much-longer-secret-value',
    );

    assert.strictEqual(shortModel.maskedText, `KEY=${MASKED_VALUE}`);
    assert.strictEqual(longModel.maskedText, `KEY=${MASKED_VALUE}`);
    assert.strictEqual(
      shortModel.maskedText.split(MASKED_VALUE).length,
      longModel.maskedText.split(MASKED_VALUE).length,
    );
  });

  test('never includes unique value sentinels', () => {
    const sentinel = 'ENV_VEIL_SENTINEL_7F1D9C';
    const model = createMaskedEnvModel(
      `FIRST="${sentinel}"\nSECOND=${sentinel}\nTHIRD="prefix ${sentinel} suffix"`,
    );

    assert.ok(!model.maskedText.includes(sentinel));
    assert.strictEqual(model.hasHiddenValues, true);
  });
});
