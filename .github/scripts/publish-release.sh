#!/usr/bin/env bash
# Attach build outputs to the GitHub release for the current version.
#
#   publish-release.sh <file>...
#
# The release is tagged v<version> from the root package.json. It is created on
# first use; later builds of the same version replace their own files. Several
# workflows call this at once, so losing the race to create the release is fine.
set -euo pipefail

# Works from any directory: the version is read relative to this script.
version="$(cd "$(dirname "$0")/../.." && node -p "require('./package.json').version")"
tag="v${version}"

if ! gh release view "$tag" >/dev/null 2>&1; then
  gh release create "$tag" --title "Mosaic ${version}" --generate-notes --target "$GITHUB_SHA" ||
    gh release view "$tag" >/dev/null
fi

gh release upload "$tag" "$@" --clobber
echo "Published $# file(s) to release ${tag}"
