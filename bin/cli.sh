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

# 1. Prefer Bun if installed
if command -v bun >/dev/null 2>&1; then
	exec bun "$CLI_JS" "$@"
fi

# 2. Bun is required for compile
if [ "$is_compile" -eq 1 ]; then
	printf '%s\n' "Error: The 'compile' command requires Bun." "Install Bun: https://bun.sh" >&2
	exit 1
fi

# 3. Fallback to Node.js
exec node "$CLI_JS" "$@"
