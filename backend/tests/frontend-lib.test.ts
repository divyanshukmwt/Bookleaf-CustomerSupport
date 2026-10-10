// Pure frontend helpers, tested from the backend suite (the frontend has no test runner of its own).
import assert from 'node:assert/strict';
import test from 'node:test';
import { CHECKS_SCOPE, verificationFor } from '../../frontend/lib/draftVerification';
import type { Draft } from '../../frontend/lib/types';

const draft = (o: Partial<Draft>): Draft => ({ id: 'd', status: 'COMPLETED', source: 'AI', route: 'HYBRID', body: 'x', validationStatus: 'PASSED', validationIssues: [], context: null, error: null, createdAt: '2026-10-11T00:00:00Z', ...o });

test('a generated draft is never labelled "verified"', () => {
  for (const status of ['PASSED', 'FLAGGED', 'REJECTED', null] as const) {
    const v = verificationFor(draft({ validationStatus: status }));
    assert.doesNotMatch(`${v.label} ${v.detail}`, /\bverified\b/i, String(status));
  }
  assert.match(CHECKS_SCOPE, /do not judge tone/);
});

test('verification levels map from validation status; warnings are passed through', () => {
  assert.equal(verificationFor(draft({ validationStatus: 'PASSED' })).level, 'PASSED');
  assert.equal(verificationFor(null).level, 'NONE');
  assert.equal(verificationFor(draft({ status: 'PROCESSING' })).level, 'NONE');
  assert.equal(verificationFor(draft({ validationStatus: null, body: null })).level, 'NOT_CHECKED');
  const f = verificationFor(draft({ validationStatus: 'FLAGGED', validationIssues: [{ severity: 'warning', code: 'TIMELINE', message: 'Unknown timeline' }] }));
  assert.equal(f.level, 'FLAGGED');
  assert.deepEqual(f.warnings, ['Unknown timeline']);
  assert.equal(verificationFor(draft({ validationStatus: 'REJECTED' })).level, 'WITHHELD');
});
