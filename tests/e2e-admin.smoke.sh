#!/usr/bin/env bash
set -euo pipefail

: "${E2E_ADMIN_TOKEN:?Set E2E_ADMIN_TOKEN to the local test token before running this script.}"
export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
export PWCLI="$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh"

"$PWCLI" open "${BASE_URL:-http://127.0.0.1:8791}/admin"
trap '"$PWCLI" close >/dev/null 2>&1 || true' EXIT
base_url="${BASE_URL:-http://127.0.0.1:8791}"
image_path="${E2E_IMAGE:-/Users/jingguanyu/Documents/websiteturnsaway/design/concepts/concept-01-world-expo-archive/screenshot-mobile.png}"
code=$(node -e '
  const fs = require("fs");
  const [file, baseUrl, token, imagePath] = process.argv.slice(1);
  let source = fs.readFileSync(file, "utf8");
  source = source.replace(`"__BASE_URL__"`, JSON.stringify(baseUrl));
  source = source.replace(`"__E2E_ADMIN_TOKEN__"`, JSON.stringify(token));
  source = source.replace(`"__E2E_IMAGE__"`, JSON.stringify(imagePath));
  process.stdout.write(source);
' tests/e2e-admin.smoke.mjs "$base_url" "$E2E_ADMIN_TOKEN" "$image_path")
output=$("$PWCLI" run-code "$code" 2>&1)
printf '%s\n' "$output"
if [[ "$output" != *"E2E_PASS"* ]]; then
  echo "browser smoke did not report success" >&2
  exit 1
fi
