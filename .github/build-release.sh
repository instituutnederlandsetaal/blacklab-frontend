#!/bin/bash
set -euo pipefail

version="${1:?Usage: build-release.sh <tag>}"
[[ "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || { echo "Invalid stable release tag: $version" >&2; exit 1; }
[[ "$(git rev-parse HEAD)" == "$(git rev-parse "refs/tags/$version^{commit}")" ]] || { echo "Checkout must match the release tag" >&2; exit 1; }
notes="docs/src/060_release_notes/$version.md"
[[ -f "$notes" ]] || { echo "Missing release notes: $notes" >&2; exit 1; }
[[ "$(mvn help:evaluate -Dexpression=project.version -q -DforceStdout)" == "$version" ]] || { echo "POM version does not match tag" >&2; exit 1; }

mvn --no-transfer-progress clean verify -B
artifacts=target/release-artifacts
mkdir -p "$artifacts"
cp "target/blacklab-frontend-$version.war" "$artifacts/"
cp "$notes" "$artifacts/RELEASE_NOTES.md"

if [[ -d src/frontend/src/customization-api ]]; then
    api=./src/frontend/dist/customization-api
    [[ "$(npm pkg get version --prefix "$api")" == "\"$version\"" ]] || { echo "Customization API package must be version $version" >&2; exit 1; }
    cp "$api/index.d.ts" "$artifacts/blacklab-frontend-customization-api-$version.d.ts"
    tarball=$(npm pack "$api" --silent --pack-destination "$artifacts")
    mv "$artifacts/$tarball" "$artifacts/blacklab-frontend-customization-api-$version.tgz"
fi
