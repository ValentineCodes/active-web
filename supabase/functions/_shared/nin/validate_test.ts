import { normalizeNinInput } from './validate.ts';

Deno.test('normalizeNinInput accepts 11 digits with surrounding whitespace', () => {
  const value = normalizeNinInput('  12345678901  ');
  if (value !== '12345678901') {
    throw new Error('expected normalized nin');
  }
});

Deno.test('normalizeNinInput rejects non-numeric and wrong length', () => {
  if (normalizeNinInput('1234567890') !== null) throw new Error('expected null');
  if (normalizeNinInput('123456789012') !== null) throw new Error('expected null');
  if (normalizeNinInput('abcdefghijk') !== null) throw new Error('expected null');
});
