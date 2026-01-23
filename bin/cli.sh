#!/usr/bin/env sh
set -eu

# Resolve symlinks to find the actual script location
SCRIPT="$0"
while [ -L "$SCRIPT" ]; do
	SCRIPT_DIR=$(cd -P "$(dirname "$SCRIPT")" && pwd)
	SCRIPT=$(readlink "$SCRIPT")
	case "$SCRIPT" in
		/*) ;;
		*) SCRIPT="$SCRIPT_DIR/$SCRIPT" ;;
	esac
done
SCRIPT_DIR=$(cd -P "$(dirname "$SCRIPT")" && pwd)
CLI_JS="$SCRIPT_DIR/../dist/cli.js"

is_compile=0
for arg in "$@"; do
	if [ "$arg" = "compile" ]; then
		is_compile=1
		break
	fi
done

# Check if Bun version is >= 1.3
bun_version_ok() {
	version=$(bun --version 2>/dev/null) || return 1
	major=$(printf '%s' "$version" | cut -d. -f1)
	minor=$(printf '%s' "$version" | cut -d. -f2)
	[ "$major" -gt 1 ] || { [ "$major" -eq 1 ] && [ "$minor" -ge 3 ]; }
}

# 1. Prefer Bun if installed and version >= 1.3
if command -v bun >/dev/null 2>&1 && bun_version_ok; then
	exec bun "$CLI_JS" "$@"
fi

# 2. Bun >= 1.3 is required for compile
if [ "$is_compile" -eq 1 ]; then
	if ! command -v bun >/dev/null 2>&1; then
		printf '%s\n' "Error: The 'compile' command requires Bun >= 1.3." "Install Bun: https://bun.sh" >&2
		exit 1
	fi
	if ! bun_version_ok; then
		printf '%s\n' "Error: The 'compile' command requires Bun >= 1.3 (found $(bun --version))." "Update Bun: https://bun.sh" >&2
		exit 1
	fi
fi

# 3. Fallback to Node.js
exec node "$CLI_JS" "$@"
