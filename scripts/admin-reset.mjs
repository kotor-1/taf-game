#!/usr/bin/env node
// Organizer-only tool. Secrets are entered locally, never sent to the browser.
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';

const DEFAULT_URL = 'https://jzjzjoabrqqijbynnkwa.supabase.co';
const ID_PATTERN = /^[a-z0-9_]{4,20}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeLookup(value) {
  const normalized = String(value).trim().toLowerCase();
  if (ID_PATTERN.test(normalized)) return { column: 'username', value: normalized };
  if (UUID_PATTERN.test(normalized)) return { column: 'user_id', value: normalized };
  throw new Error('ログインID（英数字・_ の4〜20文字）またはアカウント番号（UUID）を入力してください。');
}

export function adminHeaders(key) {
  if (key.startsWith('sb_secret_')) return { apikey: key, 'Content-Type': 'application/json' };
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) {
    let claims;
    try { claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')); } catch {}
    if (claims?.role === 'service_role') {
      return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
    }
  }
  throw new Error('Secret key（sb_secret_...）または管理者用service_roleキーが必要です。公開キーは使えません。');
}

async function ask(prompt) {
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  try { return await reader.question(prompt); } finally { reader.close(); }
}

// Raw terminal input prevents passwords and keys from appearing in the terminal
// or its scrollback. Never accept secrets in command-line arguments.
async function askHidden(prompt) {
  if (!process.stdin.isTTY) throw new Error('秘密情報の入力には対話型ターミナルが必要です。');
  process.stdout.write(prompt);
  const input = process.stdin;
  const wasRaw = !!input.isRaw;
  return new Promise((resolve, reject) => {
    let value = '';
    const done = (error) => {
      input.off('data', onData);
      input.setRawMode(wasRaw);
      input.pause();
      process.stdout.write('\n');
      if (error) reject(error); else resolve(value);
    };
    const onData = (chunk) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003' || character === '\u0004') return done(new Error('中止しました。'));
        if (character === '\r' || character === '\n') return done();
        if (character === '\u007f' || character === '\b') value = [...value].slice(0, -1).join('');
        else if (character >= ' ' && character !== '\u001b') value += character;
      }
    };
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

export async function requestAdmin(projectUrl, headers, path, options = {}) {
  let response;
  try {
    response = await fetch(`${projectUrl}${path}`, {
      ...options, headers, redirect: 'error', signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error('Supabaseに接続できませんでした。接続先とネットワークを確認してください。');
  }
  if (!response.ok) {
    // Intentionally do not log server bodies, request headers, or passwords.
    throw new Error(`Supabaseの処理が失敗しました（HTTP ${response.status}）。キー・SQL設定・パスワード要件を確認してください。`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function main() {
  const arguments_ = process.argv.slice(2);
  if (arguments_.includes('--help')) {
    console.log('使い方: node scripts/admin-reset.mjs [--lookup]\n\n--lookup: IDまたは問い合わせ用アカウント番号から、登録IDを確認します。\n指定なし: 本人確認済みの利用者のパスワードを再設定します。\nキーとパスワードは対話入力で画面に表示されません。\n接続先はSUPABASE_URL、キーはSUPABASE_SECRET_KEYでも指定できます。');
    return;
  }
  if (arguments_.some(argument => argument !== '--lookup')) throw new Error('未対応の引数です。秘密情報をコマンドの引数に渡さないでください。--helpで使い方を表示できます。');
  if (!process.stdin.isTTY) throw new Error('この管理ツールは主催者の対話型ターミナルで実行してください。');
  const project = new URL(process.env.SUPABASE_URL || DEFAULT_URL);
  if (project.protocol !== 'https:' || !project.hostname.endsWith('.supabase.co') || project.username || project.password || project.search || project.hash) {
    throw new Error('接続先はHTTPSのSupabase Project URLにしてください。');
  }
  console.log(`接続先: ${project.origin}\n主催者が本人確認を終えた利用者だけを操作してください。`);
  const lookup = normalizeLookup(await ask('ログインID または アカウント番号（UUID）: '));
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || await askHidden('Supabase Secret key（非表示）: ');
  const headers = adminHeaders(secretKey.trim());
  const query = new URLSearchParams({ select: 'user_id,username,created_at', [lookup.column]: `eq.${lookup.value}`, limit: '2' });
  const profiles = await requestAdmin(project.origin, headers, `/rest/v1/taf_profiles?${query}`);
  if (!Array.isArray(profiles) || profiles.length !== 1 || !UUID_PATTERN.test(profiles[0].user_id) || !ID_PATTERN.test(profiles[0].username)) {
    throw new Error('該当するゲームアカウントが見つかりません。ID・アカウント番号とSQLの設定を確認してください。');
  }
  const profile = profiles[0];
  console.log(`登録ID: ${profile.username}\nアカウント番号: ${profile.user_id}\n登録日時: ${profile.created_at}`);
  if (arguments_.includes('--lookup')) return;

  const confirmation = await ask(`パスワードを再設定するID「${profile.username}」をもう一度入力: `);
  if (confirmation.trim() !== profile.username) throw new Error('IDが一致しないため、中止しました。');
  const password = await askHidden('新しいパスワード（8〜128文字、非表示）: ');
  if (password.length < 8 || password.length > 128) throw new Error('パスワードは8〜128文字にしてください。');
  if (password !== await askHidden('新しいパスワードをもう一度（非表示）: ')) throw new Error('パスワードが一致しないため、中止しました。');
  await requestAdmin(project.origin, headers, `/auth/v1/admin/users/${profile.user_id}`, {
    method: 'PUT', body: JSON.stringify({ password, email_confirm: true }),
  });
  console.log('パスワードを再設定しました。本人に安全な方法で伝え、新しいパスワードでログインしてもらってください。');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : '処理を完了できませんでした。');
    process.exitCode = 1;
  });
}
