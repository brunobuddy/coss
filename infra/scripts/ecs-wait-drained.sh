#!/usr/bin/env bash
# Waits until ECS has finished a service's rollout, so none of its old tasks can answer a request:
#   infra/scripts/ecs-wait-drained.sh site
# ecs-deploy.sh returns earlier, while old tasks may still be taking traffic. Anything run after this
# sees only the new code. Never fails: a late cleanup mustn't stop what comes after it.
source "$(dirname "$0")/lib.sh"

service="${1:?usage: ecs-wait-drained.sh <service>}"
limit="${DRAIN_TIMEOUT_SECONDS:-600}"

while :; do
  finished="$(aws ecs describe-services --cluster "$CLUSTER" --services "$service" --output json \
    | jq -r '.services[0].deployments | length == 1 and .[0].rolloutState == "COMPLETED"')"
  if [ "$finished" = true ]; then
    echo "$service: old tasks are gone after ${SECONDS}s"
    exit 0
  fi
  if [ "$SECONDS" -ge "$limit" ]; then
    echo "::warning::$service: old tasks still running after ${limit}s; cached pages may be stale"
    exit 0
  fi
  sleep 5
done
