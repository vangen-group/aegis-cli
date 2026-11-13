#!/bin/bash
# Tests for user-visible lines that must only claim work the run actually did
# (the same truth class as the pull-progress fix, 78e28c8):
#   - the `aegis update` summary's cleanup line states what was removed; when
#     nothing was queued it says there was nothing to clean and prints no
#     success check;
#   - the rebuild log line after `compose up -d --wait dev` distinguishes a
#     real recreate from a container that was already running unchanged, and
#     falls back to the previous wording when the log says nothing recognisable.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/bin/aegis"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

passed=0
failed=0

assert_equals() {
    local name="$1" expected="$2" actual="$3"
    if [[ "$expected" == "$actual" ]]; then
        printf "${GREEN}✓${NC} %s\n" "$name"
        passed=$((passed + 1))
    else
        printf "${RED}✗${NC} %s\n" "$name"
        printf "  Expected: %s\n" "$expected"
        printf "  Actual:   %s\n" "$actual"
        failed=$((failed + 1))
    fi
}

# Scratch directory for the fixture compose logs (removed on exit; lives
# outside the worktree).
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT

# --- S1: the update summary's cleanup line follows the removal count ---------

test_cleanup_line_removed() {
    assert_equals "cleanup with images removed keeps the success line" \
        "  ✓ Previous images cleaned up" \
        "$(_update_cleanup_line 3 "no-stale-images")"
}

test_cleanup_line_nothing_no_stale() {
    assert_equals "cleanup with 0 removed and no stale images: no success check" \
        "  - Nothing to clean up: no stale images" \
        "$(_update_cleanup_line 0 "no-stale-images")"
}

test_cleanup_line_same_version() {
    assert_equals "cleanup with 0 removed because the version did not change" \
        "  - Nothing to clean up: same version, no stale images" \
        "$(_update_cleanup_line 0 "same-version")"
}

# --- S2: the rebuild log line follows what compose reported ------------------

test_apply_claim_recreated() {
    local log="${scratch}/recreated.log"
    cat > "$log" <<'EOF'
 Network aegis_default  Creating
 Network aegis_default  Created
 Container aegis-egress-proxy-1  Running
 Container aegis-dev-1  Recreated
 Container aegis-dev-1  Started
 Container aegis-dev-1  Waiting
 Container aegis-dev-1  Healthy
EOF
    assert_equals "a Recreated log claims the container was recreated" \
        "container recreated, proxy reloaded" \
        "$(_compose_apply_claim "$(_compose_apply_class "$log")")"
}

test_apply_claim_created_and_started() {
    local log="${scratch}/created.log"
    cat > "$log" <<'EOF'
 Container aegis-egress-proxy-1  Created
 Container aegis-egress-proxy-1  Started
 Container aegis-dev-1  Created
 Container aegis-dev-1  Started
EOF
    assert_equals "a Created/Started log claims the container was recreated" \
        "container recreated, proxy reloaded" \
        "$(_compose_apply_claim "$(_compose_apply_class "$log")")"
}

test_apply_claim_already_running() {
    # The egress-proxy restart appends its own Started lines to the SAME log;
    # they must never make an unchanged dev container read as recreated.
    local log="${scratch}/running.log"
    cat > "$log" <<'EOF'
 Container aegis-egress-proxy-1  Running
 Container aegis-dev-1  Running
 Container aegis-egress-proxy-1  Stopping
 Container aegis-egress-proxy-1  Started
EOF
    assert_equals "a Running log claims nothing was recreated" \
        "container already running unchanged, proxy reloaded" \
        "$(_compose_apply_claim "$(_compose_apply_class "$log")")"
}

test_apply_claim_unknown_falls_back() {
    local log="${scratch}/nothing.log"
    : > "$log"
    assert_equals "an empty log falls back to the previous wording" \
        "container recreated, proxy reloaded" \
        "$(_compose_apply_claim "$(_compose_apply_class "$log")")"

    printf 'Network aegis_default  Created\ngarbage with no container lines\n' > "${scratch}/noise.log"
    assert_equals "a log with no recognisable container line falls back" \
        "container recreated, proxy reloaded" \
        "$(_compose_apply_claim "$(_compose_apply_class "${scratch}/noise.log")")"

    assert_equals "a missing log file falls back without crashing" \
        "container recreated, proxy reloaded" \
        "$(_compose_apply_claim "$(_compose_apply_class "${scratch}/does-not-exist.log")")"
}

main() {
    printf "=== Aegis Update Report Tests ===\n\n"

    test_cleanup_line_removed;          printf "\n"
    test_cleanup_line_nothing_no_stale; printf "\n"
    test_cleanup_line_same_version;     printf "\n"
    test_apply_claim_recreated;         printf "\n"
    test_apply_claim_created_and_started; printf "\n"
    test_apply_claim_already_running;   printf "\n"
    test_apply_claim_unknown_falls_back; printf "\n"

    printf "=== Results ===\n"
    printf "${GREEN}Passed: %d${NC}\n" "$passed"
    if [[ $failed -gt 0 ]]; then
        printf "${RED}Failed: %d${NC}\n" "$failed"
        exit 1
    fi
    exit 0
}

main "$@"
