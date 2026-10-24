#!/bin/bash
# Tests for aegis update UX functions

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/bin/aegis"

# Colors for test output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

passed=0
failed=0

assert_equals() {
    local name="$1" expected="$2" actual="$3"
    if [[ "$expected" == "$actual" ]]; then
        printf "${GREEN}✓${NC} %s\n" "$name"
        ((passed++))
    else
        printf "${RED}✗${NC} %s\n" "$name"
        printf "  Expected: %s\n" "$expected"
        printf "  Actual:   %s\n" "$actual"
        ((failed++))
    fi
}

# Test: _format_bytes
test_format_bytes() {
    local result

    result=$(_format_bytes 512)
    assert_equals "_format_bytes(512)" "512 B" "$result"

    result=$(_format_bytes 1024)
    assert_equals "_format_bytes(1024)" "1.0 KB" "$result"

    result=$(_format_bytes $((1024 * 1024)))
    assert_equals "_format_bytes(1MB)" "1.0 MB" "$result"

    result=$(_format_bytes $((1024 * 1024 * 1024)))
    assert_equals "_format_bytes(1GB)" "1.0 GB" "$result"
}

# Test: _format_eta
test_format_eta() {
    local result

    result=$(_format_eta 30)
    assert_equals "_format_eta(30)" "30s" "$result"

    result=$(_format_eta 90)
    assert_equals "_format_eta(90)" "1m 30s" "$result"

    result=$(_format_eta 3600)
    assert_equals "_format_eta(3600)" "1h 0m" "$result"

    result=$(_format_eta 3665)
    assert_equals "_format_eta(3665)" "1h 1m" "$result"
}

# Test: progress bar generation
test_progress_bar() {
    printf "Testing progress bar generation...\n"

    # Just verify the function runs without error
    _update_step_progress 0 2>/dev/null
    printf "${GREEN}✓${NC} _update_step_progress(0) runs\n"
    ((passed++))

    _update_step_progress 50 2>/dev/null
    printf "${GREEN}✓${NC} _update_step_progress(50) runs\n"
    ((passed++))

    _update_step_progress 100 2>/dev/null
    printf "${GREEN}✓${NC} _update_step_progress(100) runs\n"
    ((passed++))
}

# Test: logging functions
test_logging() {
    local temp_log=$(mktemp)
    trap "rm -f $temp_log" EXIT

    _UPDATE_LOG_FILE="$temp_log"
    _UPDATE_VERBOSE=0

    _update_log "INFO" "Test message"

    if grep -q "Test message" "$temp_log"; then
        printf "${GREEN}✓${NC} _update_log writes to file\n"
        ((passed++))
    else
        printf "${RED}✗${NC} _update_log writes to file\n"
        ((failed++))
    fi
}

# Run all tests
main() {
    printf "=== Aegis Update UX Tests ===\n\n"

    test_format_bytes
    printf "\n"

    test_format_eta
    printf "\n"

    test_progress_bar
    printf "\n"

    test_logging
    printf "\n"

    printf "=== Results ===\n"
    printf "${GREEN}Passed: %d${NC}\n" "$passed"
    if [[ $failed -gt 0 ]]; then
        printf "${RED}Failed: %d${NC}\n" "$failed"
        exit 1
    else
        printf "All tests passed!\n"
        exit 0
    fi
}

main "$@"
