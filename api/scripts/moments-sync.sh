#!/usr/bin/env bash
# Mirror the tables that still write their own rows into the moment spine.
# Invoked by the wildpc `wild-life-moments-sync` job; wild-life-api does the work.
#
# Doses, readings and task completions are authored through their own surfaces and
# land in routine_instances / metric_entries / tasks. A moment for them exists only
# because this ran, so without it a dose logged at noon is missing from the timeline
# until someone remembers to backfill. Temporary: it goes when those surfaces move.
set -euo pipefail

: "${WILD_LIFE_API_URL:=http://localhost:9005}"

curl -fsS -X POST "${WILD_LIFE_API_URL}/moments/sync" \
  -H "Authorization: Bearer ${WILD_LIFE_TOKEN}" \
  -H "Content-Type: application/json"
echo
