#!/bin/sh
# Block commits that add secrets.
#
# Scans only the lines added in the staged diff, plus the names of staged files.
# Uses gitleaks too when it is installed. To accept a false positive, add the
# marker "secret-scan: allow" in a comment on the same line.
#
# Exit 0 when clean, 1 when something looks like a secret.

set -u

ROOT=$(git rev-parse --show-toplevel) || exit 1
cd "$ROOT" || exit 1

TMP_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t secretscan)
trap 'rm -rf "$TMP_DIR"' EXIT INT TERM
ADDED="$TMP_DIR/added"
HITS="$TMP_DIR/hits"
: >"$HITS"

found=0

# 1. Forbidden file names (private keys, env files, local credential stores).
git diff --cached --name-only --diff-filter=ACMR >"$TMP_DIR/files"
while IFS= read -r path; do
  name=$(basename "$path")
  case "$name" in
    .env.example | .env.sample | .env.template | *.pub) continue ;;
    .env | .env.* | *.pem | *.key | *.p12 | *.pfx | *.keystore | *.jks | \
    id_rsa | id_dsa | id_ecdsa | id_ed25519 | .npmrc | .pypirc | .netrc | \
    hosts.yml | ipc.storage.json | credentials.json | service-account*.json)
      printf '%s: file type that usually holds credentials\n' "$path" >>"$HITS"
      found=1
      ;;
  esac
done <"$TMP_DIR/files"

# 2. Added lines as "path:line: content", skipping allow-listed lines.
git diff --cached --no-color --no-ext-diff -U0 --diff-filter=ACMR |
  awk '
    /^\+\+\+ / { file = substr($0, 7); next }
    /^@@ / {
      split($0, parts, " ")
      sub(/^\+/, "", parts[3]); split(parts[3], start, ",")
      line = start[1] + 0
      next
    }
    /^\+/ { print file ":" line ": " substr($0, 2); line++ }
  ' | grep -v 'secret-scan: allow' >"$ADDED"

check() { # check <description> <extended regex> [i]
  desc=$1
  regex=$2
  flags=-E
  [ "${3:-}" = i ] && flags=-iE
  matches=$(grep $flags -- "$regex" "$ADDED") || return 0
  printf '%s\n' "$matches" | while IFS= read -r m; do
    loc=$(printf '%s' "$m" | cut -d: -f1-2)
    printf '%s: %s\n' "$loc" "$desc"
  done >>"$HITS"
  found=1
}

check "private key block" '-----BEGIN ([A-Z0-9]+ )*PRIVATE KEY( BLOCK)?-----'
check "AWS access key id" '(^|[^A-Z0-9])(AKIA|ASIA)[0-9A-Z]{16}([^A-Z0-9]|$)'
check "GitHub token" '(^|[^A-Za-z0-9_])(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})'
check "Anthropic API key" 'sk-ant-[A-Za-z0-9_-]{20,}'
check "OpenAI-style API key" '(^|[^A-Za-z0-9_-])sk-(proj-)?[A-Za-z0-9]{32,}'
check "Slack token" 'xox[abprs]-[A-Za-z0-9-]{10,}'
check "Google API key" 'AIza[0-9A-Za-z_-]{35}'
check "Stripe live key" '(sk|rk)_live_[0-9A-Za-z]{20,}'
check "Mapbox secret token" 'sk\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}'
check "JSON Web Token" 'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
check "Sentry DSN with key" 'https://[0-9a-f]{32}@[A-Za-z0-9.-]*sentry\.io/[0-9]+'
check "URL with embedded password" '[a-z][a-z0-9+.-]*://[^/:@[:space:]]+:[^/@[:space:]]{6,}@'

# Generic "name = 'value'" assignments. Placeholder-looking values are ignored.
generic='(password|passwd|pwd|secret|client_?secret|api_?key|access_?key|auth_?token|access_?token|refresh_?token|private_?key)["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"'][^"'"'"'[:space:]]{12,}["'"'"']'
if grep -iE -- "$generic" "$ADDED" >"$TMP_DIR/generic"; then
  grep -viE '(x{4,}|\*{4,}|example|placeholder|changeme|dummy|fake|redacted|your[_-]|<[^>]*>|\$\{|\{\{|process\.env|environment\.)' \
    "$TMP_DIR/generic" >"$TMP_DIR/generic_kept" || true
  if [ -s "$TMP_DIR/generic_kept" ]; then
    while IFS= read -r m; do
      loc=$(printf '%s' "$m" | cut -d: -f1-2)
      printf '%s: hard-coded credential assignment\n' "$loc"
    done <"$TMP_DIR/generic_kept" >>"$HITS"
    found=1
  fi
fi

# 3. gitleaks, when available, as a second opinion.
if command -v gitleaks >/dev/null 2>&1; then
  if gitleaks git --help >/dev/null 2>&1; then
    gitleaks git --staged --redact --no-banner >"$TMP_DIR/gitleaks" 2>&1 || {
      echo "gitleaks: possible secret in staged changes" >>"$HITS"
      found=1
      cat "$TMP_DIR/gitleaks" >&2
    }
  else
    gitleaks protect --staged --redact --no-banner >"$TMP_DIR/gitleaks" 2>&1 || {
      echo "gitleaks: possible secret in staged changes" >>"$HITS"
      found=1
      cat "$TMP_DIR/gitleaks" >&2
    }
  fi
fi

if [ "$found" -ne 0 ] || [ -s "$HITS" ]; then
  {
    echo "Commit blocked: staged changes look like they contain secrets."
    echo
    sort -u "$HITS" | sed 's/^/  /'
    echo
    echo "Remove the secret and unstage it (git restore --staged <file>), then rotate it if it was ever pushed."
    echo "False positive? Add a comment containing \"secret-scan: allow\" on that line."
  } >&2
  exit 1
fi

exit 0
