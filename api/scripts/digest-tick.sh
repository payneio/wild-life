#!/usr/bin/env bash
# Send the daily morning digest push. Driven by the castle calendar-digest job.
set -euo pipefail
: "${PERSONAL_API_URL:=http://localhost:9005}"
curl -fsS -X POST "${PERSONAL_API_URL}/nudges/digest" \
  -H "Authorization: Bearer ${PERSONAL_API_TOKEN}" -H "Content-Type: application/json"
echo
