#!/usr/bin/env bash
# Fire any due calendar reminders. Invoked by the castle `calendar-reminders`
# job on a schedule; wild-life-api does the actual work (expand occurrences,
# send Web Push, record the ledger). This is just the trigger.
set -euo pipefail

: "${WILD_LIFE_API_URL:=http://localhost:9005}"

curl -fsS -X POST "${WILD_LIFE_API_URL}/calendar/reminders/tick" \
  -H "Authorization: Bearer ${WILD_LIFE_TOKEN}" \
  -H "Content-Type: application/json"
echo
