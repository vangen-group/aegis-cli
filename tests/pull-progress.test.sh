#!/bin/bash
# Tests for docker pull progress truth (S1-S4):
#   - the progress counter counts only layers that actually TRANSFERRED,
#     never layers that were already on disk ('Already exists');
#   - the curated success line distinguishes "already local" from a real
#     download, and prefers docker's own Status marker over the layer lines.

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

# Scratch directory for the fixture pull logs (removed on exit; lives outside
# the worktree).
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT

# helper: write a log file from stdin
write_log() {
    local name="$1"; shift
    cat > "${scratch}/${name}"
}

# --- S1/S3: _pg_pull_counts counts only transferred layers -------------------

test_warm_pull_counts() {
    local log="${scratch}/warm.log"
    cat > "$log" <<'EOF'
a1b2c3d4e5f6: Already exists
f6e5d4c3b2a1: Already exists
998877665544: Already exists
Status: Image is up to date for registry.example/vangen/aegis:main
EOF
    assert_equals "warm pull counts nothing as transferred" "0 0" "$(_pg_pull_counts "$log")"
}

test_cold_pull_counts() {
    local log="${scratch}/cold.log"
    cat > "$log" <<'EOF'
a1b2c3d4e5f6: Pulling fs layer
f6e5d4c3b2a1: Pulling fs layer
a1b2c3d4e5f6: Downloading [==>                 ]  10.2MB/50MB
f6e5d4c3b2a1: Downloading [===============>   ]  20.2MB/30MB
a1b2c3d4e5f6: Verifying Checksum
a1b2c3d4e5f6: Pull complete
f6e5d4c3b2a1: Pull complete
Status: Downloaded newer image for registry.example/vangen/aegis:main
EOF
    assert_equals "cold pull counts every transferred layer" "2 2" "$(_pg_pull_counts "$log")"
}

test_mixed_pull_counts() {
    local log="${scratch}/mixed.log"
    cat > "$log" <<'EOF'
a1b2c3d4e5f6: Pulling fs layer
f6e5d4c3b2a1: Already exists
998877665544: Pulling fs layer
a1b2c3d4e5f6: Pull complete
998877665544: Pull complete
Status: Downloaded newer image for registry.example/vangen/aegis:main
EOF
    # Two layers moved; the one that was already on disk never counts.
    assert_equals "mixed pull transfers only its new layers" "2 2" "$(_pg_pull_counts "$log")"
}

test_empty_log_counts() {
    local log="${scratch}/empty.log"
    : > "$log"
    assert_equals "an empty log counts 0 0 without crashing" "0 0" "$(_pg_pull_counts "$log")"

    printf 'garbage with no layer lines\n' > "${scratch}/noise.log"
    assert_equals "a log with no usable lines counts 0 0" "0 0" "$(_pg_pull_counts "${scratch}/noise.log")"

    assert_equals "a missing log file counts 0 0" "0 0" "$(_pg_pull_counts "${scratch}/does-not-exist.log")"
}

# --- S2/S3: the final line tells what actually happened ----------------------

test_warm_pull_final_line() {
    local log="${scratch}/warm-line.log"
    cat > "$log" <<'EOF'
a1b2c3d4e5f6: Already exists
f6e5d4c3b2a1: Already exists
Status: Image is up to date for registry.example/vangen/aegis:main
EOF
    assert_equals "warm pull: no download claim" \
        "image already present locally, nothing downloaded (5s)" \
        "$(_pull_final_line "$log" 5)"
}

test_cold_pull_final_line() {
    local log="${scratch}/cold-line.log"
    cat > "$log" <<'EOF'
a1b2c3d4e5f6: Pulling fs layer
a1b2c3d4e5f6: Pull complete
f6e5d4c3b2a1: Pulling fs layer
f6e5d4c3b2a1: Pull complete
998877665544: Pulling fs layer
998877665544: Pull complete
Status: Downloaded newer image for registry.example/vangen/aegis:main
EOF
    assert_equals "cold pull: download claim with layer count" \
        "image downloaded (9s, 3 layers)" \
        "$(_pull_final_line "$log" 9)"
}

test_cold_pull_single_layer_line() {
    local log="${scratch}/cold-one.log"
    cat > "$log" <<'EOF'
a1b2c3d4e5f6: Pulling fs layer
a1b2c3d4e5f6: Pull complete
Status: Downloaded newer image for registry.example/vangen/aegis:1.2.3
EOF
    assert_equals "cold pull: one layer reads as singular" \
        "image downloaded (4s, 1 layer)" \
        "$(_pull_final_line "$log" 4)"
}

test_marker_absent_falls_back_to_layers() {
    local log="${scratch}/nomarker.log"
    cat > "$log" <<'EOF'
a1b2c3d4e5f6: Pulling fs layer
a1b2c3d4e5f6: Pull complete
f6e5d4c3b2a1: Pulling fs layer
f6e5d4c3b2a1: Pull complete
EOF
    # Older docker or an interrupted log: the layer count decides.
    assert_equals "no marker plus transfers: download claim" \
        "image downloaded (3s, 2 layers)" \
        "$(_pull_final_line "$log" 3)"

    cat > "${scratch}/nomarker-warm.log" <<'EOF'
a1b2c3d4e5f6: Already exists
f6e5d4c3b2a1: Already exists
EOF
    assert_equals "no marker and no transfers: no download claim" \
        "image already present locally, nothing downloaded (3s)" \
        "$(_pull_final_line "${scratch}/nomarker-warm.log" 3)"
}

test_unusable_log_final_line() {
    local log="${scratch}/nothing.log"
    : > "$log"
    assert_equals "an empty log: no download claim, no crash" \
        "image already present locally, nothing downloaded (2s)" \
        "$(_pull_final_line "$log" 2)"
}

# --- S3: the docker marker wins over the layer lines -------------------------

test_marker_overrides_layers() {
    # Marker says up to date even though stray layer lines exist.
    local log="${scratch}/marker-warm.log"
    cat > "$log" <<'EOF'
a1b2c3d4e5f6: Pulling fs layer
a1b2c3d4e5f6: Pull complete
Status: Image is up to date for registry.example/vangen/aegis:main
EOF
    assert_equals "up-to-date marker beats leaked layer lines" \
        "image already present locally, nothing downloaded (7s)" \
        "$(_pull_final_line "$log" 7)"
}

main() {
    printf "=== Aegis Pull Progress Tests ===\n\n"

    test_warm_pull_counts;        printf "\n"
    test_cold_pull_counts;        printf "\n"
    test_mixed_pull_counts;       printf "\n"
    test_empty_log_counts;        printf "\n"
    test_warm_pull_final_line;    printf "\n"
    test_cold_pull_final_line;    printf "\n"
    test_cold_pull_single_layer_line; printf "\n"
    test_marker_absent_falls_back_to_layers; printf "\n"
    test_unusable_log_final_line; printf "\n"
    test_marker_overrides_layers; printf "\n"

    printf "=== Results ===\n"
    printf "${GREEN}Passed: %d${NC}\n" "$passed"
    if [[ $failed -gt 0 ]]; then
        printf "${RED}Failed: %d${NC}\n" "$failed"
        exit 1
    fi
    exit 0
}

main "$@"
