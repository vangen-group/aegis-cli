#!/bin/sh
# Prints the next patch tag for a sync-driven release (vX.Y.Z -> vX.Y.Z+1).
#
# Why a script and not inline YAML: the version arithmetic is the part that
# can be wrong, and a workflow step cannot be tested locally. This can.
#
#   sh scripts/next-release-tag.sh v0.6.5   -> v0.6.6
#   sh scripts/next-release-tag.sh ""       -> (nothing, exit 0; first release)
#   sh scripts/next-release-tag.sh nope     -> (stderr, exit 1)
set -eu

last="${1:-}"

if [ -z "$last" ]; then
    # No previous tag: the human decides the first one; nothing to print.
    exit 0
fi

case "$last" in
    v[0-9]*.[0-9]*.[0-9]*) ;;
    *) echo "next-release-tag: not a vX.Y.Z tag: $last" >&2; exit 1 ;;
esac

rest="${last#v}"
major="${rest%%.*}"
rest="${rest#*.}"
minor="${rest%%.*}"
patch="${rest#*.}"

case "${major}${minor}${patch}" in
    *[!0-9]*) echo "next-release-tag: not a vX.Y.Z tag: $last" >&2; exit 1 ;;
esac

printf 'v%s.%s.%s\n' "$major" "$minor" "$((patch + 1))"
