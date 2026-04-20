#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
SESSION_NAME="clawsprawl"
DEFAULT_PROFILE_ID="sprawl-lab"
LOCAL_PROFILE_ID="private-local"
LOCAL_PROFILE_TARGET="$ROOT_DIR/src/config/profiles/private.local.ts"
PROFILE_OVERRIDE=""
TOKEN_OVERRIDE=""
PROFILE_FILE_OVERRIDE=""
ATTACH=1
AUTO_INIT_LOCAL=0

usage() {
  cat <<'EOF'
ClawSprawl ops controller

Usage:
  scripts/cs-ops.sh <command> [options]

Commands:
  help                     Show this help text
  list-profiles            Show built-in profile ids
  init-local-profile       Create private local profile file
  set-profile              Persist PUBLIC_MAINFRAME_PROFILE in .env
  qa                       Run normal QA (test + build + e2e)
  qa-strict                Run strict QA gates with coverage checks
  dev                      Start Astro dev server (SSR mode)
  start                    Start production SSR server
  screenshots              Generate documentation screenshots
  tmux-up                  Start tmux session with dev pane
  tmux-attach              Attach to tmux session
  tmux-down                Stop tmux session
  status                   Show quick workspace status

Common options:
  --profile <id>           Override PUBLIC_MAINFRAME_PROFILE for this run
  --local                  Shortcut for --profile private-local
  --profile-file <path>    Copy profile file to src/config/profiles/private.local.ts (auto-detect id)
  --auto-init-local        Ensure local profile file exists before running
  --env-file <path>        Env file to source (default: .env)
  --token <value>          Override OPENCLAW_GATEWAY_TOKEN for server-side gateway auth
  --session <name>         tmux session name (default: clawsprawl)
  --no-attach              Do not auto-attach after tmux-up
  -h, --help               Show help

Examples:
  scripts/cs-ops.sh init-local-profile
  scripts/cs-ops.sh set-profile --profile private-local
  scripts/cs-ops.sh tmux-up --profile private-local
  scripts/cs-ops.sh tmux-up --local --auto-init-local
  scripts/cs-ops.sh tmux-up --profile-file /path/to/my-profile.ts
  scripts/cs-ops.sh dev --profile-file /path/to/my-profile.ts
  scripts/cs-ops.sh qa-strict
EOF
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "error: required command not found: $cmd" >&2
    exit 1
  fi
}

parse_options() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --profile)
        PROFILE_OVERRIDE="$2"
        shift 2
        ;;
      --local)
        PROFILE_OVERRIDE="$LOCAL_PROFILE_ID"
        shift
        ;;
      --profile-file)
        PROFILE_FILE_OVERRIDE="$2"
        shift 2
        ;;
      --auto-init-local)
        AUTO_INIT_LOCAL=1
        shift
        ;;
      --env-file)
        ENV_FILE="$2"
        shift 2
        ;;
      --token)
        TOKEN_OVERRIDE="$2"
        shift 2
        ;;
      --session)
        SESSION_NAME="$2"
        shift 2
        ;;
      --no-attach)
        ATTACH=0
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "error: unknown option: $1" >&2
        usage
        exit 1
        ;;
    esac
  done
}

load_env() {
  if [[ -f "$ENV_FILE" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      line="${line%%#*}"
      line="${line%"${line##*[![:space:]]}"}"
      [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] || continue
      export "$line"
    done < "$ENV_FILE"
  fi

  if [[ -n "$PROFILE_OVERRIDE" ]]; then
    export PUBLIC_MAINFRAME_PROFILE="$PROFILE_OVERRIDE"
  fi

  if [[ -n "$TOKEN_OVERRIDE" ]]; then
    export OPENCLAW_GATEWAY_TOKEN="$TOKEN_OVERRIDE"
  fi
}

ensure_profile() {
  if [[ -z "${PUBLIC_MAINFRAME_PROFILE:-}" ]]; then
    export PUBLIC_MAINFRAME_PROFILE="$DEFAULT_PROFILE_ID"
  fi
}

apply_profile_file() {
  if [[ -z "$PROFILE_FILE_OVERRIDE" ]]; then
    return
  fi

  if [[ ! -f "$PROFILE_FILE_OVERRIDE" ]]; then
    echo "error: profile file not found: $PROFILE_FILE_OVERRIDE" >&2
    exit 1
  fi

  local detected_profile_id
  cp "$PROFILE_FILE_OVERRIDE" "$LOCAL_PROFILE_TARGET"
  detected_profile_id="$(node -e "const fs=require('node:fs');const text=fs.readFileSync(process.argv[1],'utf8');const match=text.match(/\bid\s*:\s*['\"]([^'\"]+)['\"]/);if(match)process.stdout.write(match[1]);" "$LOCAL_PROFILE_TARGET" 2>/dev/null || true)"

  if [[ -n "$PROFILE_OVERRIDE" ]]; then
    export PUBLIC_MAINFRAME_PROFILE="$PROFILE_OVERRIDE"
  elif [[ -n "$detected_profile_id" ]]; then
    export PUBLIC_MAINFRAME_PROFILE="$detected_profile_id"
  else
    export PUBLIC_MAINFRAME_PROFILE="$LOCAL_PROFILE_ID"
  fi

  echo "loaded profile override into $LOCAL_PROFILE_TARGET"
  echo "active profile id: $PUBLIC_MAINFRAME_PROFILE"
}

persist_profile() {
  ensure_profile
  mkdir -p "$(dirname "$ENV_FILE")"
  touch "$ENV_FILE"

  local tmp_file
  tmp_file="$ENV_FILE.tmp"

  awk -v profile="$PUBLIC_MAINFRAME_PROFILE" '
    BEGIN { set = 0 }
    /^PUBLIC_MAINFRAME_PROFILE=/ {
      print "PUBLIC_MAINFRAME_PROFILE=" profile
      set = 1
      next
    }
    { print }
    END {
      if (set == 0) {
        print "PUBLIC_MAINFRAME_PROFILE=" profile
      }
    }
  ' "$ENV_FILE" > "$tmp_file"

  mv "$tmp_file" "$ENV_FILE"
  echo "profile set in $ENV_FILE -> $PUBLIC_MAINFRAME_PROFILE"
}

run_in_root() {
  (
    cd "$ROOT_DIR"
    "$@"
  )
}

tmux_up() {
  require_cmd tmux
  ensure_profile

  if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "tmux session already exists: $SESSION_NAME"
  else
    tmux new-session -d -s "$SESSION_NAME" -n app "cd \"$ROOT_DIR\" && export PUBLIC_MAINFRAME_PROFILE=\"$PUBLIC_MAINFRAME_PROFILE\" && npm run dev"
    tmux new-window -t "$SESSION_NAME" -n shell "cd \"$ROOT_DIR\""
    if [[ -n "${OPENCLAW_GATEWAY_TOKEN:-}" ]]; then
      tmux set-environment -t "$SESSION_NAME" OPENCLAW_GATEWAY_TOKEN "$OPENCLAW_GATEWAY_TOKEN"
    fi
  fi

  if [[ "$ATTACH" -eq 1 ]]; then
    tmux attach -t "$SESSION_NAME"
  fi
}

status() {
  echo "root: $ROOT_DIR"
  echo "env: $ENV_FILE"
  echo "profile: ${PUBLIC_MAINFRAME_PROFILE:-$DEFAULT_PROFILE_ID}"
  if [[ -n "${OPENCLAW_GATEWAY_TOKEN:-}" ]]; then
    echo "gateway token: configured (server-side)"
  else
    echo "gateway token: missing"
  fi

  if command -v tmux >/dev/null 2>&1; then
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
      echo "tmux session: running ($SESSION_NAME)"
    else
      echo "tmux session: not running ($SESSION_NAME)"
    fi
  fi
}

COMMAND="${1:-help}"
if [[ $# -gt 0 ]]; then
  shift
fi

parse_options "$@"
load_env

apply_profile_file

if [[ "$AUTO_INIT_LOCAL" -eq 1 ]]; then
  run_in_root node scripts/setup-local-profile.mjs
fi

case "$COMMAND" in
  help)
    usage
    ;;
  list-profiles)
    echo "built-in profiles:"
    echo "- $DEFAULT_PROFILE_ID (default)"
    echo "- public-demo"
    echo "local override profile id:"
    echo "- $LOCAL_PROFILE_ID (from src/config/profiles/*.local.ts)"
    ;;
  init-local-profile)
    run_in_root node scripts/setup-local-profile.mjs
    ;;
  set-profile)
    ensure_profile
    persist_profile
    ;;
  qa)
    run_in_root npm run qa
    ;;
  qa-strict)
    run_in_root npm run qa:strict
    ;;
  dev)
    ensure_profile
    run_in_root npm run dev
    ;;
  start)
    ensure_profile
    run_in_root npm run start
    ;;
  screenshots)
    run_in_root npm run docs:screenshots
    ;;
  tmux-up)
    tmux_up
    ;;
  tmux-attach)
    require_cmd tmux
    tmux attach -t "$SESSION_NAME"
    ;;
  tmux-down)
    require_cmd tmux
    tmux kill-session -t "$SESSION_NAME"
    ;;
  status)
    status
    ;;
  *)
    echo "error: unknown command: $COMMAND" >&2
    usage
    exit 1
    ;;
esac
