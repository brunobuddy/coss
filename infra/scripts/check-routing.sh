#!/usr/bin/env bash
# Compares the routing in infra/terraform/spec.json with what is live, read-only:
#   infra/scripts/check-routing.sh
# The ALB's HTTPS listener (default action; each rule's priority, target group, host and path
# conditions and verification header names — never the header values, which are secrets) and the
# coss.com distribution's cached behaviours (order, path pattern, origin). Deploys ship code, but
# routing only changes with `terraform apply`: a new site route that was never applied sends its
# paths to the dashboard. Exits 1 and prints the differences on drift. DISTRIBUTION_ID names the
# coss.com distribution (looked up by its alias when unset).
source "$(dirname "$0")/lib.sh"

spec="$(dirname "$0")/../terraform/spec.json"
name="coss-${STAGE}"

lb="$(aws elbv2 describe-load-balancers --names "$name" --query 'LoadBalancers[0].LoadBalancerArn' --output text)"
listener="$(aws elbv2 describe-listeners --load-balancer-arn "$lb" \
  --query 'Listeners[?Port==`443`].ListenerArn | [0]' --output text)"
distribution="${DISTRIBUTION_ID:-$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?contains(Aliases.Items, 'coss.com')].Id | [0]" --output text)}"

# One line per rule or behaviour; values inside a condition are sorted (their order means nothing).
expected="$(jq -r --arg name "$name" '
  def values($field; $config): [.conditions[] | select(.Field == $field) | .[$config].Values[]] | sort | join(",");
  (.alb.httpsListener.defaultAction | "alb default \(.Type) \(.FixedResponseConfig.StatusCode // "")"),
  (.alb.httpsListener.rules | sort_by(.priority)[]
    | "alb rule \(.priority) → \($name)-\(.targetGroup)"
      + " host=[\(values("host-header"; "HostHeaderConfig"))]"
      + " path=[\(values("path-pattern"; "PathPatternConfig"))]"
      + " header=[\([.conditions[] | select(.Field == "http-header") | .HttpHeaderConfig.HttpHeaderName] | sort | join(","))]"),
  (.cloudFront.distributions["coss.com"].cachedBehaviours | to_entries[]
    | "cloudfront behaviour \(.key) \(.value.pathPattern) → \(.value.origin)")
' "$spec")"

listener_json="$(aws elbv2 describe-listeners --listener-arns "$listener" --output json)"
rules_json="$(aws elbv2 describe-rules --listener-arn "$listener" --output json)"
distribution_json="$(aws cloudfront get-distribution-config --id "$distribution" --output json)"

actual="$(
  jq -r '.Listeners[0].DefaultActions[0] | "alb default \(.Type) \(.FixedResponseConfig.StatusCode // "")"' <<<"$listener_json"
  jq -r '
    def values($field; $config): [.Conditions[] | select(.Field == $field) | .[$config].Values[]] | sort | join(",");
    .Rules | map(select(.IsDefault | not)) | sort_by(.Priority | tonumber)[]
    | "alb rule \(.Priority) → \(.Actions[0].TargetGroupArn // (.Actions[0].ForwardConfig.TargetGroups // [] | max_by(.Weight).TargetGroupArn) // "none" | split("/")[1] | sub("-tls$"; ""))"
      + " host=[\(values("host-header"; "HostHeaderConfig"))]"
      + " path=[\(values("path-pattern"; "PathPatternConfig"))]"
      + " header=[\([.Conditions[] | select(.Field == "http-header") | .HttpHeaderConfig.HttpHeaderName] | sort | join(","))]"
  ' <<<"$rules_json"
  jq -r '.DistributionConfig.CacheBehaviors.Items // [] | to_entries[]
    | "cloudfront behaviour \(.key) \(.value.PathPattern) → \(.value.TargetOriginId)"' <<<"$distribution_json"
)"

if [ "$expected" = "$actual" ]; then
  echo "routing matches infra/terraform/spec.json ($(grep -c '^alb rule' <<<"$expected") ALB rules, $(grep -c '^cloudfront' <<<"$expected") cached behaviours)"
  exit 0
fi
echo "routing drift: run terraform apply (infra/terraform, README \"Deploying to AWS\")" >&2
echo "--- spec.json   +++ live" >&2
diff <(echo "$expected") <(echo "$actual") | grep -E '^[<>]' | sed 's/^</- spec:/; s/^>/+ live:/' >&2
exit 1
