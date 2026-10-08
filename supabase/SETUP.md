# Supabase の初期設定

対象プロジェクト: `jzjzjoabrqqijbynnkwa` / 公開ゲーム: https://kotor-1.github.io/taf-game/

ユーザーは自分で ID とパスワードを決めます。メールアドレスの入力・確認はありません。忘れた場合の問い合わせ先は **rkoto2810@gmail.com** です。問い合わせメールを自動送信する機能ではなく、利用者が自分で問い合わせる運用です。

## 1. 認証の設定

[Supabase ダッシュボード](https://supabase.com/dashboard/project/jzjzjoabrqqijbynnkwa/auth/providers)で Email / Password 認証を有効にし、次のように設定します。

- 新規ユーザー登録を許可: ON
- Email / Password: ON
- Confirm email（メールアドレスの確認）: **OFF**
- パスワード最短文字数: **8**（ゲーム側は8〜128文字）
- Site URL: `https://kotor-1.github.io/taf-game/`

ID は前後の空白を除去して小文字に統一し、半角英数字と `_` の4〜20文字です。Supabase Auth には `ID@id.taf-game.invalid` の形式で登録します。このアドレスにはメールを配信しません。内部アドレスを実際の連絡先へ変更せず、ID は固定して運用してください。

Confirm email が ON のままだと、架空アドレスへの確認が必要になってログインできません。先に OFF にしてください。既に作成された未確認のアカウントは、設定を変えただけでは確認済みにならないことがあります。主催者用の再設定ツールは対象アカウントの確認済み設定も行います。

## 2. セーブ用 SQL を実行

[SQL Editor](https://supabase.com/dashboard/project/jzjzjoabrqqijbynnkwa/sql/new)を開き、[マイグレーション](./migrations/202610080001_taf_accounts_and_saves.sql)の内容をすべて貼り付けて Run を押します。全体を再実行しても、既存のゲームセーブを初期化しません。他のアプリのテーブルや認証ユーザーを削除しません。

SQL は次を作成します。

| 名前 | 用途 |
| --- | --- |
| `public.taf_profiles` | 認証 UUID と固定ログイン ID の対応 |
| `public.taf_saves` | ユーザーごとのセーブ、更新番号、サーバー保存時刻 |
| `public.taf_save_game` | 更新番号を照合して保存する RPC |
| `taf_private` | アプリに直接公開しない内部関数 |

`taf_private` を Supabase の Exposed schemas に追加しないでください。ブラウザーからは本人の行だけを読み取れます。テーブルへの直接の追加・更新・削除は禁止し、本人の UUID を内部で求める RPC で保存します。別端末で新しいセーブが作られていると古い更新番号による保存を拒否し、意図しない上書きを防ぎます。

ゲームは公開用キーだけを使用します。Secret key、service_role キー、データベースのパスワードをゲームの JavaScript・GitHub・公開サイトに追加しないでください。

## 3. 確認

1. 公開ゲームで新規 ID を登録し、メール確認なしでログインできることを確認します。
2. 少し進めて保存し、別のブラウザーから同じ ID でログインして続きを読み込みます。
3. 別の ID では最初の ID のセーブが表示されないことを確認します。
4. 2つの端末で同じ古いセーブを開き、一方を進めて保存した後、もう一方で保存すると競合が案内されることを確認します。

SQL や認証設定が済んでいなくても、端末内セーブとファイルの書き出しは利用できます。クラウドのエラー表示を残し、クラウド保存できたと誤表示しない設計です。

## 主催者による ID 確認・パスワード再設定

利用者には ID や問い合わせ用のアカウント番号（UUID）を控えてもらいます。問い合わせを受けたら、主催者が事前の連絡経路や参加者情報などで本人を確認します。このゲームは本物のメールアドレスを収集しないため、**アカウント番号を知っているだけで本人確認を完了したとは扱わないでください**。ID も UUID も手がかりがなく本人との照合ができなければ、安全に復旧できない場合があります。元のパスワードを調べることはできません。

主催者のパソコンのターミナルで、プロジェクトのフォルダーから実行します。Node.js 18以上を使います。

```sh
node scripts/admin-reset.mjs --lookup
```

ID または UUID から登録 ID を確認します。本人確認後にパスワードを再設定するときは次を実行します。

```sh
node scripts/admin-reset.mjs
```

対話画面で ID / UUID、Supabase の管理用 Secret key、新パスワードを入力します。キー・新パスワードは画面に表示しません。パスワードは2回入力し、再設定する ID も確認します。ログイン用の ID やゲームセーブは変えません。

管理用キーは Supabase の Project Settings → API Keys から主催者が取得します。このチャットへ送る必要はありません。新形式の Secret key を推奨し、既存の service_role JWT も利用できます。`SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` 環境変数にも対応していますが、キーをコマンド引数やシェル履歴に残さない対話入力をおすすめします。

再設定したパスワードは本人に安全な方法で伝えます。主催者が登録ID・問い合わせ用番号と参加者情報の対応を保管する場合は、本人確認に必要な範囲だけにしてください。

## 実装契約

```text
GET /rest/v1/taf_saves?select=payload,revision,updated_at&user_id=eq.<ログイン中のUUID>
POST /rest/v1/rpc/taf_save_game
  {"p_payload": <version 2 のゲーム状態>, "p_expected_revision": 0}
  -> {"revision": 1, "updated_at": "..."}
```

保存済み行がない初回だけ `p_expected_revision = 0` を使い、以降は最後に読み取った `revision` を渡します。成功すると更新番号は1増えます。競合時は SQLSTATE `P0001` / `TAF_SAVE_CONFLICT`。そのほか `TAF_AUTH_REQUIRED`、`TAF_PROFILE_REQUIRED`、`TAF_INVALID_SAVE`、`TAF_INVALID_REVISION` を返します。最大20MiBの JSON、version2の基本形をサーバーで検査し、ゲームの詳細な妥当性はクライアントの `validateSave` で検査します。

更新番号は競合防止に使うため、保存時刻を比較して強制上書きしません。この仕組みはユーザーが改造したローカルセーブの不正を判定するものではありません。

## 開発時の検証

`supabase/tests/schema.test.mjs` は PostgreSQL を実行する PGlite を使い、匿名アクセスの拒否、ユーザー間の分離、同時保存の競合、直接書き込みの拒否、JSONB の往復、SQL 再実行時のデータ保持を検証します。テスト用 PGlite を任意の一時ディレクトリへインストールし、`TAF_PGLITE_MODULE` にその `dist/index.js` の絶対パスを指定します。未指定の場合は DB 検証だけをスキップします。本番への接続・ユーザー作成は行いません。

```sh
node --test supabase/tests/*.test.mjs
```

主催者ツールのテストは外部接続なしで実行できます。通常のゲームと保存のテストは `npm test` で実行します。

公式資料: [パスワード認証](https://supabase.com/docs/guides/auth/passwords)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[関数の権限](https://supabase.com/docs/guides/database/functions)、[管理者による更新](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid)、[公開用キーと管理用キー](https://supabase.com/docs/guides/getting-started/api-keys)
