#!/bin/sh
# Refuse direct pushes to protected branches (git pre-push hook).
#
# Git passes "<remote name> <remote url>" as arguments and one line per ref on stdin:
#   <local ref> <local sha> <remote ref> <remote sha>
#
# Protected branches default to "main master develop". Change them with:
#   git config hooks.protectedBranches "main master"
# This is a local safety net: "git push --no-verify" skips it. Use GitHub branch
# protection rules for enforcement.

set -u

REMOTE_NAME=${1:-remote}
PROTECTED=$(git config --get hooks.protectedBranches || echo "main master develop")

blocked=""
while read -r local_ref local_sha remote_ref remote_sha; do
  [ -n "${remote_ref:-}" ] || continue
  case "$remote_ref" in
    refs/heads/*) branch=${remote_ref#refs/heads/} ;;
    *) continue ;;
  esac
  for p in $PROTECTED; do
    if [ "$branch" = "$p" ]; then
      case "$local_sha" in
        *[!0]*) action="push to" ;;
        *) action="delete" ;;
      esac
      blocked="$blocked
  $action '$branch' on '$REMOTE_NAME'"
    fi
  done
done

if [ -n "$blocked" ]; then
  current=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)
  {
    echo "Push blocked: direct pushes to protected branches are not allowed.$blocked"
    echo
    echo "Trunk-based flow: push a short-lived branch and open a pull request against main:"
    echo "  git switch -c feat/<short-name>      # if you are still on '$current'"
    echo "  git push -u $REMOTE_NAME feat/<short-name>"
    echo "  gh pr create --repo vdRobin/elevate --base main"
    echo
    echo "Protected branches: $PROTECTED (git config hooks.protectedBranches)"
  } >&2
  exit 1
fi

exit 0
