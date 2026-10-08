#!/bin/zsh
cd "$(dirname "$0")" || exit 1

game_url="http://127.0.0.1:4173"
game_ready() {
  /usr/bin/curl --silent --max-time 1 "$game_url/health" | /usr/bin/grep -q '"app":"hokago-track-club"'
}

if game_ready; then
  open "$game_url"
  exit 0
fi

node_bin="$(command -v node)"
if [[ -z "$node_bin" ]]; then
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
    if [[ -x "$candidate" ]]; then
      node_bin="$candidate"
      break
    fi
  done
fi

if [[ -z "$node_bin" ]]; then
  print "Node.js 18 以降が必要です。Node.js をインストールしてから、もう一度開いてください。"
  read -k 1 "?何かキーを押すと閉じます。"
  exit 1
fi

HOST=127.0.0.1 PORT=4173 "$node_bin" server.mjs &
game_server_pid=$!
trap 'kill "$game_server_pid" 2>/dev/null' EXIT
trap 'exit 0' INT TERM

for attempt in {1..40}; do
  if game_ready; then
    open "$game_url"
    print "ゲームを開きました。このターミナルを閉じるとサーバーが終了します。"
    wait "$game_server_pid"
    exit $?
  fi
  if ! kill -0 "$game_server_pid" 2>/dev/null; then
    wait "$game_server_pid"
    read -k 1 "?起動できませんでした。何かキーを押すと閉じます。"
    exit 1
  fi
  sleep 0.2
done

print "起動を確認できませんでした。ターミナルのエラーを確認してください。"
read -k 1 "?何かキーを押すと閉じます。"
exit 1
