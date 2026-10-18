#!/usr/bin/env bash
set -euo pipefail

: "${E2E_ADMIN_TOKEN:?Set E2E_ADMIN_TOKEN to the local test token before running this script.}"
pwcli="${PWCLI:-${CODEX_HOME:-$HOME/.codex}/skills/playwright/scripts/playwright_cli.sh}"
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
base_url="${BASE_URL:-http://127.0.0.1:8791}"
image_path="${E2E_IMAGE:-$repo_root/design/concepts/concept-01-world-expo-archive/screenshot-mobile.png}"

"$pwcli" open "$base_url/admin"
trap '"$pwcli" close >/dev/null 2>&1 || true' EXIT
for browser_test in e2e-admin.smoke.mjs e2e-editor.mjs; do
  code=$(node -e '
    const fs = require("fs");
    const [file, baseUrl, token, imagePath] = process.argv.slice(1);
    let source = fs.readFileSync(file, "utf8");
    source = source.replace(`"__BASE_URL__"`, JSON.stringify(baseUrl));
    source = source.replace(`"__E2E_ADMIN_TOKEN__"`, JSON.stringify(token));
    source = source.replace(`"__E2E_IMAGE__"`, JSON.stringify(imagePath));
    process.stdout.write(source);
  ' "$repo_root/tests/$browser_test" "$base_url" "$E2E_ADMIN_TOKEN" "$image_path")
  output=$("$pwcli" run-code "$code" 2>&1)
  printf '%s\n' "$output"
  expected="E2E_PASS"
  if [[ "$browser_test" == "e2e-editor.mjs" ]]; then expected="E2E_EDITOR_PASS"; fi
  if [[ "$output" != *"$expected"* ]]; then
    printf '%s did not report success\n' "$browser_test" >&2
    exit 1
  fi
done
