#!/bin/sh
# Works over SSH and from any working directory. All options go to build_all.py.
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if [ -x "$script_dir/tools/.venv/bin/python" ]; then
    python="$script_dir/tools/.venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
    python=python3
else
    printf '%s\n' 'Python 3.10 or newer is required. Install python3 and its venv support, then try again.' >&2
    exit 1
fi

# A bare terminal invocation is friendly; unattended runs never gain a prompt.
if [ "$#" -eq 0 ] && [ -t 0 ]; then
    set -- --interactive
fi

exec "$python" "$script_dir/tools/build_all.py" "$@"
