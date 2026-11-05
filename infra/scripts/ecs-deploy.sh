#!/usr/bin/env bash
# Rolls services out to an image tag (the commit), waiting until each runs it:
#   infra/scripts/ecs-deploy.sh <tag> api worker web site
# Registers a revision of each service's latest task definition (so environment changes made by
# Terraform ship too) with the new image, updates every service, then waits for them together: the
# deployment circuit breaker rolls failed rollouts back. A service behind the load balancer is done
# once every new task passed its health checks and ECS scaled the old ones to zero (they can answer
# requests for a little longer: ecs-wait-drained.sh waits for them to go). One without (the worker: a running process is all ECS checks) once the old tasks
# are gone and the new ones have run for STABLE_SECONDS without a failure, so a crash on start
# can't pass for a deploy. Either way that's minutes before ECS calls the rollout COMPLETED.
source "$(dirname "$0")/lib.sh"

STABLE_SECONDS=60
# Seconds since the youngest running task of revision $arn started (0 if none). The CLI prints
# timestamps as ISO 8601 with the runner's UTC offset.
# shellcheck disable=SC2016 # a jq program
TASK_AGE='
  def epoch:
    if type == "number" then . else
      capture("^(?<t>[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2})(\\.[0-9]+)?(?<z>Z|(?<sign>[+-])(?<h>[0-9]{2}):?(?<m>[0-9]{2}))$") as $c
      | ($c.t + "Z" | fromdateiso8601)
        - (if $c.z == "Z" then 0
           else ($c.h | tonumber) * 3600 + ($c.m | tonumber) * 60 | if $c.sign == "+" then . else -. end end)
    end;
  [.tasks[] | select(.taskDefinitionArn == $arn and .lastStatus == "RUNNING") | .startedAt | epoch]
  | if length == 0 then 0 else (now - max | floor) end'

tag="${1:?usage: ecs-deploy.sh <tag> <service...>}"
shift
[ "$#" -gt 0 ] || { echo "no services given" >&2; exit 2; }

# Parallel to "$@" (macOS ships bash 3, which has no associative arrays).
revisions=()
for service in "$@"; do
  revision="$(register_with_image "$service" "$tag")"
  revisions+=("$revision")
  aws ecs update-service --cluster "$CLUSTER" --service "$service" \
    --task-definition "$revision" --query service.serviceName --output text >/dev/null
  echo "$service → ${revision##*/}"
done

index=0
for service in "$@"; do
  revision="${revisions[$index]}"
  index=$((index + 1))
  deadline=$((SECONDS + 1200))
  while :; do
    state="$(aws ecs describe-services --cluster "$CLUSTER" --services "$service" --output json \
      | jq -r --arg arn "$revision" '
          .services[0] as $service
          | $service.deployments as $all
          | ($all | map(select(.taskDefinition == $arn))[0]) as $ours
          | if $ours == null or $ours.rolloutState == "FAILED" then "failed"
            elif $ours.rolloutState == "COMPLETED" and ($all | length) == 1 then "done"
            elif ($service.loadBalancers | length) > 0
              and $ours.status == "PRIMARY"
              and $ours.desiredCount > 0 and $ours.runningCount == $ours.desiredCount
              and ($ours.failedTasks // 0) == 0
              and ($all | map(select(.taskDefinition != $arn) | .desiredCount) | all(. == 0))
              then "serving"
            elif ($service.loadBalancers | length) == 0
              and $ours.status == "PRIMARY"
              and $ours.desiredCount > 0 and $ours.runningCount == $ours.desiredCount
              and ($ours.failedTasks // 0) == 0
              and ($all | map(select(.taskDefinition != $arn) | .runningCount) | all(. == 0))
              then "settling"
            else "waiting" end')"
    # Settling: done once every new task has been running for STABLE_SECONDS.
    if [ "$state" = settling ]; then
      tasks="$(aws ecs list-tasks --cluster "$CLUSTER" --service-name "$service" --desired-status RUNNING \
        --query taskArns --output text)"
      if [ -n "$tasks" ] && [ "$tasks" != None ]; then
        # shellcheck disable=SC2086 # one argument per task ARN
        age="$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks $tasks --output json \
          | jq -r --arg arn "$revision" "$TASK_AGE")"
        [ "$age" -ge "$STABLE_SECONDS" ] && state=stable
      fi
    fi
    case "$state" in
      done) echo "$service is running $tag"; break ;;
      serving) echo "$service is serving $tag (old tasks stopping)"; break ;;
      stable) echo "$service is running $tag (stable for ${STABLE_SECONDS}s)"; break ;;
      failed)
        echo "$service: the rollout to $tag failed (rolled back). Recent events:" >&2
        aws ecs describe-services --cluster "$CLUSTER" --services "$service" \
          --query 'services[0].events[:8].message' --output text >&2
        exit 1 ;;
    esac
    [ "$SECONDS" -lt "$deadline" ] || { echo "$service: still rolling out after 20 minutes" >&2; exit 1; }
    sleep 5
  done
done
