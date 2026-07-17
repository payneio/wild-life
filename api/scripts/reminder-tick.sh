#!/usr/bin/env bash
# Fire any due calendar reminders. Invoked by the castle `calendar-reminders`
# job on a schedule; personal-api does the actual work (expand occurrences,
# send Web Push, record the ledger). This is just the trigger.
set -euo pipefail

: "${PERSONAL_API_URL:=http://localhost:9005}"

curl -fsS -X POST "${PERSONAL_API_URL}/calendar/reminders/tick" \
  -H "Authorization: Bearer ${PERSONAL_API_TOKEN}" \
  -H "Content-Type: application/json"
echo
