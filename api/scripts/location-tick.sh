#!/usr/bin/env bash
# Re-derive location visits. Invoked by the wildpc `wild-life-location-tick` job
# on a schedule; wild-life-api does the work (replay a rolling window, rebuild any
# fence that moved, close visits whose fixes stopped). This is just the trigger.
#
# The replay is what lets the live path during ingest stay simple: a phone that was
# offline and flushes a day of queued fixes, or a fix that arrived out of order, is
# corrected here rather than special-cased there.
set -euo pipefail

: "${WILD_LIFE_API_URL:=http://localhost:9005}"

curl -fsS -X POST "${WILD_LIFE_API_URL}/locations/tick" \
  -H "Authorization: Bearer ${WILD_LIFE_TOKEN}" \
  -H "Content-Type: application/json"
echo
