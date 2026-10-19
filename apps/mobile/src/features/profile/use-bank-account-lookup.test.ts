import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLookupKey, projectLookupState } from './bank-account-lookup-state.ts';

test('buildLookupKey requires bank and complete NUBAN', () => {
  assert.equal(buildLookupKey(null, '0123456789'), '');
  assert.equal(buildLookupKey('058', '0123'), '');
  assert.equal(buildLookupKey('058', '0123456789'), '058:0123456789');
});

test('projectLookupState hides stale resolved names', () => {
  assert.deepEqual(projectLookupState(null, '058:0123456789'), { status: 'idle' });

  assert.deepEqual(
    projectLookupState(
      { key: '058:0123456789', status: 'resolved', accountName: 'JOHN DOE' },
      '058:0123456789',
    ),
    { status: 'resolved', accountName: 'JOHN DOE' },
  );

  assert.deepEqual(
    projectLookupState(
      { key: '058:0123456789', status: 'resolved', accountName: 'STALE NAME' },
      '044:0123456789',
    ),
    { status: 'idle' },
  );
});

test('projectLookupState hides in-flight lookup after input changes', () => {
  assert.deepEqual(
    projectLookupState({ key: '058:0123456789', status: 'loading' }, '044:0123456789'),
    { status: 'idle' },
  );
});

test('projectLookupState surfaces provider errors for current key', () => {
  assert.deepEqual(
    projectLookupState(
      { key: '058:0123456789', status: 'provider_error', message: 'Try again' },
      '058:0123456789',
    ),
    { status: 'provider_error', message: 'Try again' },
  );
});
