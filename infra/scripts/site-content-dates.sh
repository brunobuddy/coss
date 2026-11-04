#!/usr/bin/env bash
# Writes apps/site/content-dates.json: the day each file under apps/site/content last changed, for
# the sitemap and the pages' "Last updated" (build-images.sh, before the site's image: .git never
# reaches the Docker context). Needs the full history.
set -euo pipefail

[ "$(git rev-parse --is-shallow-repository)" = false ] || {
  echo "site-content-dates: this checkout is shallow, so its dates would be wrong" >&2
  exit 1
}

git -c core.quotePath=false log --format=%cs --name-only -- apps/site/content \
  | awk '
      /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/ { day = $0; next }
      /^apps\/site\// && !seen[$0]++ {
        path = substr($0, length("apps/site/") + 1)
        printf "%s\"%s\":\"%s\"", (count++ ? ",\n" : "{\n"), path, day
      }
      END { print (count ? "\n}" : "{}") }
    ' > apps/site/content-dates.json
