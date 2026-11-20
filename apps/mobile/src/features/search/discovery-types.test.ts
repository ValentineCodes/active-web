import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTopDiscoverRows, flattenDiscoverPages } from './discovery-rows.ts';
import { parseDiscoverPayload } from './discovery-types.ts';

test('parseDiscoverPayload keeps valid entity ids', () => {
  const payload = parseDiscoverPayload({
    people: [{ user_id: 'u1', username: 'alpha' }],
    requests: [{ request_id: 'r1', title: 'Fix pipe', requester_id: 'u2' }],
    projects: [{ project_id: 'p1', title: 'Roof fund', funding_status: 'open' }],
    ranking: 'deferred_ud_11',
  });
  assert.equal(payload.people?.length, 1);
  assert.equal(payload.requests?.length, 1);
  assert.equal(payload.projects?.length, 1);
  assert.equal(payload.ranking, 'deferred_ud_11');
});

test('buildTopDiscoverRows preserves section order', () => {
  const rows = buildTopDiscoverRows(
    parseDiscoverPayload({
      requests: [{ request_id: 'r1', title: 'Req', requester_id: 'u1' }],
      people: [
        {
          user_id: 'u2',
          username: 'sam',
          display_name: 'Sam',
          bio: null,
          avatar_path: null,
          rating_average: null,
          rating_count: null,
          identity_verified: false,
        },
      ],
      projects: [{ project_id: 'p1', title: 'Proj', funding_status: 'open' }],
    }),
  );
  const kinds = rows.map((row) => row.kind);
  assert.deepEqual(kinds, ['section', 'request', 'section', 'person', 'section', 'project']);
});

test('flattenDiscoverPages dedupes people across pages', () => {
  const person = {
    user_id: 'u1',
    username: 'sam',
    display_name: 'Sam',
    bio: null,
    avatar_path: null,
    rating_average: null,
    rating_count: null,
    identity_verified: false,
  };
  const rows = flattenDiscoverPages('people', [
    { offset: 0, data: parseDiscoverPayload({ people: [person] }) },
    { offset: 20, data: parseDiscoverPayload({ people: [person] }) },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.kind, 'person');
});