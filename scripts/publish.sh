#!/usr/bin/env bash
# Publish this plugin package to GitHub, and sync the wiki.
#
# Requires authenticated git push access to github.com/tomRumi (either an
# authenticated `gh` CLI, or stored HTTPS/SSH credentials). Nothing here
# creates credentials — authenticate first.
#
#   ./scripts/publish.sh            # commit (if needed), create repo if absent, push, tag, sync wiki
#   ./scripts/publish.sh --no-wiki  # skip the wiki sync
#
# Safe to re-run: every step checks current state before acting.

set -euo pipefail

OWNER="tomRumi"
REPO="hermes-session-costs"
TAG="v1.0.0"
WIKI="${REPO}.wiki"

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

SKIP_WIKI=0
[[ "${1:-}" == "--no-wiki" ]] && SKIP_WIKI=1

say() { printf '\033[1m%s\033[0m\n' "$*"; }

# --- 1. commit anything outstanding ------------------------------------------
if [[ -n "$(git status --porcelain)" ]]; then
  say "Committing outstanding changes…"
  git add -A
  git commit -m "Sync working tree before publish"
else
  say "Working tree clean."
fi

# --- 2. ensure the GitHub repo exists ----------------------------------------
if git remote get-url origin >/dev/null 2>&1; then
  say "Remote 'origin' already set: $(git remote get-url origin)"
elif command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  say "Creating github.com/${OWNER}/${REPO} (public)…"
  gh repo create "${OWNER}/${REPO}" \
    --public \
    --description "Per-session token usage, cost and context-window meter for the Hermes desktop status bar, with one-click context compression." \
    --source . --remote origin
else
  cat >&2 <<'EOF'
ERROR: no git remote and no authenticated `gh` CLI.

Create the repository yourself, then re-run this script:

    # with gh:
    brew install gh && gh auth login
    gh repo create tomRumi/hermes-session-costs --public --source . --remote origin

    # or create it empty on github.com, then:
    git remote add origin git@github.com:tomRumi/hermes-session-costs.git
EOF
  exit 1
fi

# --- 3. push default branch ---------------------------------------------------
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
say "Pushing ${BRANCH}…"
git push -u origin "${BRANCH}"

# --- 4. tag the release (the catalog pin source) ------------------------------
if git rev-parse "${TAG}" >/dev/null 2>&1; then
  say "Tag ${TAG} already exists locally."
else
  say "Tagging ${TAG}…"
  git tag -a "${TAG}" -m "${TAG}"
fi
git push origin "${TAG}" || say "Tag push skipped (already on remote)."

say "Pinned release commit (use this as the catalog 'sha' once it is 2 weeks old):"
echo "  $(git rev-list -n1 "${TAG}")"

# --- 5. wiki ------------------------------------------------------------------
if [[ "${SKIP_WIKI}" == "1" ]]; then
  say "Wiki sync skipped (--no-wiki)."
  exit 0
fi

say "Syncing wiki…"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

# The wiki git repo only exists after the wiki has been initialised once. If the
# clone fails, the user must open the repo's Wiki tab and create the first page.
if ! git clone --quiet "https://github.com/${OWNER}/${WIKI}.git" "${TMP}" 2>/dev/null; then
  cat >&2 <<EOF
NOTE: the wiki repository does not exist yet.

GitHub creates <repo>.wiki.git only after the wiki is initialised once:

  1. Open https://github.com/${OWNER}/${REPO}/wiki
  2. Click "Create the first page" and save anything (it will be overwritten).
  3. Re-run: ./scripts/publish.sh

Local wiki sources are ready in docs/wiki/ (Home.md, Install-and-upgrade.md,
What-it-does-and-does-not-do.md, How-it-works.md, Troubleshooting.md).
EOF
  exit 0
fi

# Copy pages over the clone (keeping its .git), then push.
find "${TMP}" -maxdepth 1 -name '*.md' -delete
cp "${ROOT}"/docs/wiki/*.md "${TMP}/"
git -C "${TMP}" add -A
if git -C "${TMP}" diff --cached --quiet; then
  say "Wiki already up to date."
else
  git -C "${TMP}" commit -m "Sync wiki from docs/wiki"
  git -C "${TMP}" push origin master 2>/dev/null || git -C "${TMP}" push origin main
  say "Wiki updated."
fi

say "Done."
echo "  repo:  https://github.com/${OWNER}/${REPO}"
echo "  wiki:  https://github.com/${OWNER}/${REPO}/wiki"
echo "  install link: hermes://plugin/install?repo=${OWNER}/${REPO}&enable=1"
