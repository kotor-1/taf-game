// TAF_PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js \
//   node --test supabase/tests/schema.test.mjs
// Uses real PostgreSQL in WASM. No remote credentials or production mutation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../../engine.js');
const source = await readFile(new URL('../migrations/202610080001_taf_accounts_and_saves.sql', import.meta.url), 'utf8');
const ids = ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003'];

test('Supabase migration: PostgreSQL RLS and revision isolation', { skip: !process.env.TAF_PGLITE_MODULE }, async (t) => {
  const { PGlite } = await import(process.env.TAF_PGLITE_MODULE);
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to authenticated, anon;
  `);
  await db.query('insert into auth.users (id,email) values ($1,$2)', [ids[0], 'runner_one@id.taf-game.invalid']);
  await db.exec(source);
  const setUser = async (id, role = 'authenticated') => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id || '']);
    await db.exec(`set role ${role}`);
  };
  const save = (payload, revision) => db.query('select public.taf_save_game($1::jsonb, $2::bigint) as result', [JSON.stringify(payload), revision]);
  const game = E.createGame(20261008);

  await t.test('backfills existing account; signup trigger derives ID from email, not metadata', async () => {
    await db.query('insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3)', [ids[1], 'runner_two@id.taf-game.invalid', { login_id: 'runner_one' }]);
    await db.query('insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3)', [ids[2], 'unrelated@example.test', { login_id: 'runner_one' }]);
    const { rows } = await db.query('select username from public.taf_profiles order by username');
    assert.deepEqual(rows.map(r => r.username), ['runner_one', 'runner_two']);
  });

  await t.test('anonymous users cannot read either table or invoke save', async () => {
    await setUser(null, 'anon');
    await assert.rejects(db.query('select * from public.taf_profiles'), /permission denied/);
    await assert.rejects(db.query('select * from public.taf_saves'), /permission denied/);
    await assert.rejects(save(game, 0), /permission denied/);
    await assert.rejects(db.query('select taf_private.save_game($1::jsonb, 0)', [JSON.stringify(game)]), /permission denied/);
  });

  await t.test('authenticated user reads only own profile', async () => {
    await setUser(ids[0]);
    const { rows } = await db.query('select * from public.taf_profiles');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].username, 'runner_one');
    assert.equal((await db.query('select * from public.taf_profiles where user_id=$1', [ids[1]])).rows.length, 0);
  });

  await t.test('first save is revision1 with server timestamp and full valid payload', async () => {
    const result = (await save(game, 0)).rows[0].result;
    assert.equal(result.revision, 1);
    assert.ok(Number.isFinite(Date.parse(result.updated_at)));
    const { rows } = await db.query('select * from public.taf_saves');
    assert.equal(rows[0].user_id, ids[0]);
    assert.deepEqual(rows[0].payload, game);
    assert.equal(E.validateSave(rows[0].payload), true);
  });

  await t.test('another account cannot see save or update it through a guessed revision', async () => {
    await setUser(ids[1]);
    assert.equal((await db.query('select * from public.taf_saves')).rows.length, 0);
    await assert.rejects(save(game, 1), /TAF_SAVE_CONFLICT/);
    assert.equal((await save({ ...game, schoolName: '別の高校' }, 0)).rows[0].result.revision, 1);
    assert.equal((await db.query('select * from public.taf_saves')).rows[0].payload.schoolName, '別の高校');
  });

  await t.test('stale insert and update cannot overwrite current save', async () => {
    await setUser(ids[0]);
    const before = (await db.query('select * from public.taf_saves')).rows[0];
    await assert.rejects(save({ ...game, money: 0 }, 0), /TAF_SAVE_CONFLICT/);
    await assert.rejects(save({ ...game, money: 0 }, 2), /TAF_SAVE_CONFLICT/);
    assert.deepEqual((await db.query('select * from public.taf_saves')).rows[0], before);
  });

  await t.test('same-revision concurrent writes have exactly one winner', async () => {
    const results = await Promise.allSettled([save({ ...game, money: 190000 }, 1), save({ ...game, money: 200000 }, 1)]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.match(results.find(r => r.status === 'rejected').reason.message, /TAF_SAVE_CONFLICT/);
    assert.equal(Number((await db.query('select revision from public.taf_saves')).rows[0].revision), 2);
  });

  await t.test('invalid revisions and malformed or oversized payloads are rejected without mutation', async () => {
    const before = (await db.query('select * from public.taf_saves')).rows[0];
    for (const revision of [-1, null, 9007199254740991]) await assert.rejects(save(game, revision), /TAF_INVALID_REVISION/);
    for (const value of [null, [], {}, { ...game, version: '2' }, { ...game, athletes: {} }, { ...game, schoolName: null }, { ...game, padding: 'x'.repeat(20971520) }]) {
      await assert.rejects(save(value, 2), /TAF_INVALID_SAVE/);
    }
    assert.deepEqual((await db.query('select * from public.taf_saves')).rows[0], before);
  });

  await t.test('direct table insert/update/delete is denied even to row owner', async () => {
    for (const statement of [
      'update public.taf_saves set revision=100', 'delete from public.taf_saves',
      "insert into public.taf_saves(user_id,payload) values(auth.uid(), '{}')",
      "update public.taf_profiles set username='changed'", 'delete from public.taf_profiles',
      "insert into public.taf_profiles(user_id,username) values(auth.uid(),'changed')",
    ]) await assert.rejects(db.query(statement), /permission denied/);
  });

  await t.test('JSON cannot select save owner; unrelated Auth account has no write privilege', async () => {
    await save({ ...game, user_id: ids[1] }, 2);
    assert.equal((await db.query('select user_id from public.taf_saves')).rows[0].user_id, ids[0]);
    await setUser(ids[2]);
    await assert.rejects(save(game, 0), /TAF_PROFILE_REQUIRED/);
    await setUser(null);
    await assert.rejects(save(game, 0), /TAF_AUTH_REQUIRED/);
  });

  await t.test('rerunning migration preserves profiles and saves', async () => {
    await db.exec('reset role');
    const before = await db.query('select * from public.taf_saves order by user_id');
    await db.exec(source);
    const after = await db.query('select * from public.taf_saves order by user_id');
    assert.deepEqual(after.rows, before.rows);
    await setUser(ids[0]);
    assert.equal((await save(game, 3)).rows[0].result.revision, 4);
  });

  await t.test('Auth account deletion cascades own profile and save only', async () => {
    await db.exec('reset role');
    await db.query('delete from auth.users where id=$1', [ids[0]]);
    assert.deepEqual((await db.query('select user_id from public.taf_profiles')).rows.map(r => r.user_id), [ids[1]]);
    assert.deepEqual((await db.query('select user_id from public.taf_saves')).rows.map(r => r.user_id), [ids[1]]);
  });
});
