#!/usr/bin/env bash
# Builds services' images for a commit and pushes them to ECR (the Deploy workflow's build jobs):
#   REGISTRY=… TAG=<commit> infra/scripts/build-images.sh web site
# Builds the services given in parallel, each line prefixed with its service, and skips an image
# that already exists. SENTRY_AUTH_TOKEN (optional) uploads the Next.js apps' source maps (a
# BuildKit secret, never in a layer). Runs where Docker can push to ECR (the CodeBuild runner).
set -euo pipefail

: "${REGISTRY:?}" "${TAG:?}"
[ "$#" -gt 0 ] || { echo "no services given" >&2; exit 2; }

aws ecr get-login-password | docker login --username AWS --password-stdin "$REGISTRY"
# Base images never come from Docker Hub here: CodeBuild's shared addresses keep running out of its
# anonymous pulls. Node is on ECR Public; Bun is copied into our ECR once per version (this pull is
# the only one, and is retried until Docker Hub allows it). Every Dockerfile has the same Bun
# version (infra/test).
bun_version="$(sed -n 's/^ARG BUN_VERSION=//p' "apps/$1/Dockerfile")"
bun_image="$REGISTRY/coss/base/bun"
if ! aws ecr describe-images --repository-name coss/base/bun --image-ids "imageTag=$bun_version-slim" >/dev/null 2>&1; then
  for attempt in 1 2 3 4 5 6; do
    docker pull --platform linux/arm64 "oven/bun:$bun_version-slim" && break
    [ "$attempt" = 6 ] && exit 1
    sleep $((attempt * 30))
  done
  docker tag "oven/bun:$bun_version-slim" "$bun_image:$bun_version-slim"
  # Another build job may have pushed it first (the tag is immutable).
  docker push "$bun_image:$bun_version-slim" \
    || aws ecr describe-images --repository-name coss/base/bun --image-ids "imageTag=$bun_version-slim" >/dev/null
fi
docker buildx create --use --driver docker-container >/dev/null

build() {
  local service="$1" image="$REGISTRY/coss/$1" release_arg deps cache cache_to=()
  if aws ecr describe-images --repository-name "coss/$service" --image-ids "imageTag=$TAG" >/dev/null 2>&1; then
    echo "$image:$TAG already exists"
    return 0
  fi
  case "$service" in
    web | site | portal | sign | scheduling) release_arg="NEXT_DEPLOYMENT_ID=$TAG" ;;
    *) release_arg="SENTRY_RELEASE=$TAG" ;;
  esac
  # Only the dependency layers are reusable (the build layer depends on the commit), so the layer
  # cache is keyed by what they're built from and exported only when that changes: exporting it
  # took longer than the build itself.
  deps="$({ cat bun.lock "apps/$service/Dockerfile"; git ls-files -z '*package.json' | xargs -0 cat; } | sha256sum | cut -c1-16)"
  cache="$image:buildcache-$deps"
  if ! aws ecr describe-images --repository-name "coss/$service" --image-ids "imageTag=buildcache-$deps" >/dev/null 2>&1; then
    cache_to=(--cache-to "type=registry,ref=$cache,mode=max,image-manifest=true,oci-mediatypes=true,ignore-error=true")
  fi
  # Our layers are zstd: compressing them took the site ~35 s in gzip, and Fargate (platform 1.4,
  # containerd) pulls and unpacks zstd faster. The base images' layers keep their gzip.
  docker buildx build . \
    --file "apps/$service/Dockerfile" \
    --platform linux/arm64 \
    --build-arg "$release_arg" \
    --build-arg "BASE_PATCH_WEEK=$(date -u +%G-W%V)" \
    --build-arg "BUN_IMAGE=$bun_image" \
    --build-arg NODE_IMAGE=public.ecr.aws/docker/library/node \
    --secret id=sentry_auth_token,env=SENTRY_AUTH_TOKEN \
    --cache-from "type=registry,ref=$cache" \
    "${cache_to[@]}" \
    --provenance=false \
    --output "type=image,name=$image:$TAG,push=true,oci-mediatypes=true,compression=zstd,compression-level=3"
}

pids=()
for service in "$@"; do
  build "$service" 2>&1 | sed -u "s/^/[$service] /" &
  pids+=("$!")
done
for pid in "${pids[@]}"; do
  wait "$pid"
done
