#!/usr/bin/env bash
# The nightly pass over location data: everything the 15-minute tick does, plus
# reclustering place candidates.
#
# Separate from the frequent tick because the two answer questions on different
# timescales. Visits want to be current. "Where do you keep going back to?" reads
# months of history and cannot change in fifteen minutes, so recomputing it that
# often would be pure churn.
set -euo pipefail

: "${WILD_LIFE_API_URL:=http://localhost:9005}"

curl -fsS -X POST "${WILD_LIFE_API_URL}/locations/tick?full=true" \
  -H "Authorization: Bearer ${WILD_LIFE_TOKEN}" \
  -H "Content-Type: application/json"
echo
