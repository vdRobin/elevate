#!/usr/bin/env bash
# Verify Elevate changes across appcore, desktop and webextension.
#
# Usage: verify.sh [options] [appcore] [desktop] [webextension]
#   (no project names)  pick projects from changed files (git status vs HEAD)
#   --all               all three projects
#   --quick             type checks + Jest specs related to changed files only
#   --build             also run production builds for affected targets
#   --dry-run           print the commands without running them
#
# Exit code: 0 when every executed check passed, 1 when one failed, 2 when
# nothing could be verified (for example dependencies are not installed).

set -u

ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$ROOT" ]; then
  echo "verify.sh: run inside the elevate git repository" >&2
  exit 2
fi
cd "$ROOT" || exit 2

ALL=0 QUICK=0 BUILD=0 DRY=0
declare -A WANT=()
for arg in "$@"; do
  case "$arg" in
    --all) ALL=1 ;;
    --quick) QUICK=1 ;;
    --build) BUILD=1 ;;
    --dry-run) DRY=1 ;;
    appcore|desktop|webextension) WANT[$arg]=1 ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "verify.sh: unknown argument '$arg'" >&2; exit 2 ;;
  esac
done

# Changed files relative to HEAD, including untracked ones.
mapfile -t CHANGED < <( { git diff --name-only HEAD; git ls-files --others --exclude-standard; } | sort -u )

SHARED_CHANGED=0
declare -A FILES=()
for f in "${CHANGED[@]}"; do
  case "$f" in
    appcore/modules/shared/*) SHARED_CHANGED=1; FILES[appcore]+="$f "; FILES[desktop]+="" ;;
    appcore/docs/*|.claude/*|*.md) ;;
    appcore/*) FILES[appcore]+="$f " ;;
    desktop/*) FILES[desktop]+="$f " ;;
    webextension/*) FILES[webextension]+="$f " ;;
  esac
done

if [ $ALL -eq 1 ]; then
  WANT=([appcore]=1 [desktop]=1 [webextension]=1)
elif [ ${#WANT[@]} -eq 0 ]; then
  [ -n "${FILES[appcore]+x}" ] && WANT[appcore]=1
  [ -n "${FILES[desktop]+x}" ] && WANT[desktop]=1
  [ -n "${FILES[webextension]+x}" ] && WANT[webextension]=1
  # Shared library runs in all three runtimes.
  if [ $SHARED_CHANGED -eq 1 ]; then WANT[appcore]=1; WANT[desktop]=1; WANT[webextension]=1; fi
fi

if [ ${#WANT[@]} -eq 0 ]; then
  echo "No code changes detected in appcore, desktop or webextension. Use --all to verify everything."
  exit 0
fi

RESULTS=()
FAILED=0 RAN=0

run() { # run <label> <dir> <command...>
  local label="$1" dir="$2"; shift 2
  echo
  echo "=== [$label] (cd $dir && $*)"
  if [ $DRY -eq 1 ]; then RESULTS+=("DRY   $label"); return 0; fi
  RAN=1
  if (cd "$dir" && "$@"); then
    RESULTS+=("PASS  $label")
  else
    RESULTS+=("FAIL  $label"); FAILED=1
  fi
}

skip() { RESULTS+=("SKIP  $1 ($2)"); }

has_deps() { [ -d "$1/node_modules" ]; }

related_specs() { # related_specs <project>  -> project-relative changed .ts paths
  local p="$1" out=()
  for f in ${FILES[$p]:-}; do
    case "$f" in *.ts) out+=("${f#"$p"/}") ;; esac
  done
  # Shared files are referenced from appcore via ../modules paths; Jest resolves them.
  echo "${out[@]:-}"
}

if [ -n "${WANT[appcore]+x}" ]; then
  if has_deps appcore || [ $DRY -eq 1 ]; then
    run "appcore type check" appcore npm run --silent type:check
    specs="$(related_specs appcore)"
    if [ $QUICK -eq 1 ] && [ -n "$specs" ]; then
      # shellcheck disable=SC2086
      run "appcore related specs" appcore npx jest --silent --findRelatedTests $specs
    else
      run "appcore tests" appcore npm test --silent
    fi
    if [ $BUILD -eq 1 ]; then
      run "appcore build desktop-prod" appcore npx ng build --configuration=desktop-prod --output-path=../dist/verify-desktop
      run "appcore build extension-prod" appcore npx ng build --configuration=extension-prod --output-path=../dist/verify-extension
    fi
  else
    skip "appcore" "no appcore/node_modules: run 'npm install' at the repository root"
  fi
fi

if [ -n "${WANT[desktop]+x}" ]; then
  if has_deps desktop || [ $DRY -eq 1 ]; then
    [ -f desktop/build_metadata.json ] || run "desktop build metadata" desktop npm run --silent build:metadata
    run "desktop type check" desktop npm run --silent type:check
    specs="$(related_specs desktop)"
    if [ $QUICK -eq 1 ] && [ -n "$specs" ]; then
      # shellcheck disable=SC2086
      run "desktop related specs" desktop npx jest --silent --findRelatedTests $specs
    else
      run "desktop tests" desktop npm test --silent
    fi
    [ $BUILD -eq 1 ] && run "desktop electron build" desktop npm run --silent build:electron@prod
  else
    skip "desktop" "no desktop/node_modules: run 'npm install' at the repository root"
  fi
fi

if [ -n "${WANT[webextension]+x}" ]; then
  if has_deps webextension || [ $DRY -eq 1 ]; then
    run "webextension type check" webextension npm run --silent type:check
    if [ $QUICK -eq 0 ]; then
      run "webextension tests (Karma, needs Chrome/Chromium)" webextension npm test --silent
    else
      skip "webextension tests" "--quick skips Karma"
    fi
  else
    skip "webextension" "no webextension/node_modules: run 'npm install' at the repository root"
  fi
fi

# Formatting of changed files, if Prettier is installed at the root.
fmt_files=()
for f in "${CHANGED[@]}"; do
  case "$f" in *.ts) [ -f "$f" ] && fmt_files+=("$f") ;; esac
done
if [ ${#fmt_files[@]} -gt 0 ]; then
  if [ -x node_modules/.bin/prettier ] || [ $DRY -eq 1 ]; then
    run "prettier check (changed .ts)" . node_modules/.bin/prettier --check "${fmt_files[@]}"
  else
    skip "prettier" "no root node_modules"
  fi
fi

echo
echo "=== Summary"
printf '%s\n' "${RESULTS[@]}"

if [ $FAILED -eq 1 ]; then exit 1; fi
if [ $DRY -eq 0 ] && [ $RAN -eq 0 ]; then
  echo "Nothing was verified."
  exit 2
fi
exit 0
