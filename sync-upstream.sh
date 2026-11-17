#!/usr/bin/env bash
# ==============================================================================
# Tsundoku Upstream Sync & Merge Reminder
# ==============================================================================
set -euo pipefail

REPO_DIR="/srv/http/tsundoku"
UPSTREAM_REMOTE="upstream"
UPSTREAM_BRANCH="master"
TRACKING_BRANCH="original_dev"
REMINDER_FILE="$REPO_DIR/.UPSTREAM_MERGE_PENDING"

cd "$REPO_DIR"

# Verify remotes
if ! git remote | grep -q "^${UPSTREAM_REMOTE}$"; then
    echo "Remote '$UPSTREAM_REMOTE' not found. Available remotes: $(git remote)"
    exit 1
fi

echo "==> Fetching updates from $UPSTREAM_REMOTE/$UPSTREAM_BRANCH..."
git fetch "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH"

# Ensure local tracking branch exists
if ! git rev-parse --verify "$TRACKING_BRANCH" >/dev/null 2>&1; then
    echo "==> Creating local tracking branch '$TRACKING_BRANCH' pointing to $UPSTREAM_REMOTE/$UPSTREAM_BRANCH..."
    git branch "$TRACKING_BRANCH" "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
fi

# Compare tracking branch with upstream
LOCAL_DEV_REV=$(git rev-parse "$TRACKING_BRANCH")
REMOTE_DEV_REV=$(git rev-parse "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH")

if [ "$LOCAL_DEV_REV" != "$REMOTE_DEV_REV" ]; then
    echo "==> Updating '$TRACKING_BRANCH' to $REMOTE_DEV_REV..."
    git branch -f "$TRACKING_BRANCH" "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
fi

# Check current checked-out branch
CURRENT_BRANCH=$(git branch --show-current || echo "master")
if [ -z "$CURRENT_BRANCH" ]; then
    CURRENT_BRANCH="master"
fi

# Compare current working branch against original_dev
BEHIND_COUNT=$(git rev-list --count "${CURRENT_BRANCH}..${TRACKING_BRANCH}" || echo "0")

if [ "$BEHIND_COUNT" -gt 0 ]; then
    COMMIT_LIST=$(git log "${CURRENT_BRANCH}..${TRACKING_BRANCH}" --oneline -n 10)
    
    # Write persistent reminder banner file
    cat <<EOF > "$REMINDER_FILE"
================================================================================
🚨 [TSUNDOKU MERGE REMINDER]
================================================================================
The original dev branch ('$TRACKING_BRANCH') has $BEHIND_COUNT new commit(s) not yet merged
into your active branch ('$CURRENT_BRANCH')!

Recent upstream commits:
$COMMIT_LIST

👉 TO MERGE AND RESOLVE CONFLICTS:
   1. cd $REPO_DIR
   2. git status
   3. git merge $TRACKING_BRANCH
   4. Resolve any conflicts in your editor
   5. git commit
   6. Rebuild / restart: docker compose up -d --build
================================================================================
EOF

    # Print to stdout/journal
    cat "$REMINDER_FILE"

    # Log to systemd journal
    logger -t tsundoku-sync "WARNING: Tsundoku upstream '$TRACKING_BRANCH' has $BEHIND_COUNT commits ahead of '$CURRENT_BRANCH'. Merge required!"

    # If any interactive terminal is active for treatandcure, broadcast reminder
    if which wall >/dev/null 2>&1; then
        echo -e "\n🚨 [Tsundoku Alert] $BEHIND_COUNT new upstream commit(s) fetched into '$TRACKING_BRANCH'. Please merge into '$CURRENT_BRANCH'!\n" | wall || true
    fi
else
    if [ -f "$REMINDER_FILE" ]; then
        rm -f "$REMINDER_FILE"
    fi
    echo "==> Up to date! No unmerged commits between '$TRACKING_BRANCH' and '$CURRENT_BRANCH'."
fi
