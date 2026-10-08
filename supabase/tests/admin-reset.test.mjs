import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLookup, adminHeaders, requestAdmin } from '../../scripts/admin-reset.mjs';

test('admin recovery accepts canonical ID or UUID and rejects query syntax', () => {
  assert.deepEqual(normalizeLookup(' Runner_01 '), { column: 'username', value: 'runner_01' });
  assert.deepEqual(normalizeLookup('10000000-0000-4000-8000-000000000001'), { column: 'user_id', value: '10000000-0000-4000-8000-000000000001' });
  for (const value of ['abc', 'runner@site', 'eq.test&select=*', '日本語', 'x'.repeat(21)]) assert.throws(() => normalizeLookup(value));
});

test('secret key uses apikey header and public keys are rejected', () => {
  assert.deepEqual(adminHeaders('sb_secret_local_test'), { apikey: 'sb_secret_local_test', 'Content-Type': 'application/json' });
  assert.throws(() => adminHeaders('sb_publishable_local_test'));
  const admin = `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`;
  assert.equal(adminHeaders(admin).Authorization, `Bearer ${admin}`);
  const anon = `header.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.signature`;
  assert.throws(() => adminHeaders(anon));
});

test('admin HTTP errors never print returned credentials or password data', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => new Response('SECRET_SHOULD_NOT_BE_PRINTED', { status: 400 });
  await assert.rejects(requestAdmin('https://example.supabase.co', {}, '/test'), error => error.message.includes('HTTP 400') && !error.message.includes('SECRET_SHOULD_NOT_BE_PRINTED'));
  globalThis.fetch = async () => { throw new Error('SECRET_SHOULD_NOT_BE_PRINTED'); };
  await assert.rejects(requestAdmin('https://example.supabase.co', {}, '/test'), error => !error.message.includes('SECRET_SHOULD_NOT_BE_PRINTED'));
});
