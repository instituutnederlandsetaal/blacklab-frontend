#!/bin/bash

# Build and prepare release artifacts
# Called by GitHub Actions release workflow.

set -euo pipefail

# Get version from tag parameter and strip 'v' prefix if present
TAG="$1"
VERSION="${TAG#v}"

if [ -z "$VERSION" ]; then
    echo "Error: Version not provided. Usage: $0 <tag>"
    exit 1
fi

# Create release artifacts directory
RELEASE_DIR="target/release-artifacts"
mkdir -p "$RELEASE_DIR"

echo "Building BlackLab Frontend release $VERSION"

# Clean and build
mvn clean package -B

# Find and copy WAR file
WAR_FILE=$(find target -name '*.war' -not -path "*/release-artifacts/*" | head -n 1)
if [ -z "$WAR_FILE" ]; then
    echo "Error: No WAR file found in target directory"
    exit 1
fi

# Ensure release directory exists before copying
mkdir -p "$RELEASE_DIR"
cp "$WAR_FILE" "$RELEASE_DIR/blacklab-frontend-${VERSION}.war"

# Publish the same standalone declarations both as a raw download and as a
# package-manager-friendly tarball. The WAR already contains this directory at
# /js/customization-api/.
CUSTOMIZATION_API_DIR="./src/frontend/dist/customization-api"
CUSTOMIZATION_API_FILE="$CUSTOMIZATION_API_DIR/index.d.ts"
if [ ! -f "$CUSTOMIZATION_API_FILE" ]; then
    echo "Error: Customization API declarations not found: $CUSTOMIZATION_API_FILE"
    exit 1
fi
CUSTOMIZATION_API_VERSION=$(npm pkg get version --prefix "$CUSTOMIZATION_API_DIR")
CUSTOMIZATION_API_VERSION="${CUSTOMIZATION_API_VERSION#\"}"
CUSTOMIZATION_API_VERSION="${CUSTOMIZATION_API_VERSION%\"}"
if [ "$CUSTOMIZATION_API_VERSION" != "$VERSION" ]; then
    echo "Error: Release tag version $VERSION does not match customization API version $CUSTOMIZATION_API_VERSION"
    exit 1
fi
cp "$CUSTOMIZATION_API_FILE" "$RELEASE_DIR/blacklab-frontend-customization-api-${VERSION}.d.ts"
npm pack "$CUSTOMIZATION_API_DIR" --pack-destination "$RELEASE_DIR"
mv "$RELEASE_DIR/inl-blacklab-frontend-customization-api-${VERSION}.tgz" "$RELEASE_DIR/blacklab-frontend-customization-api-${VERSION}.tgz"

# Copy release notes
RELEASE_NOTES_FILE="docs/src/060_release_notes/${VERSION}.md"
if [ ! -f "$RELEASE_NOTES_FILE" ]; then
    echo "Error: Release notes file not found: $RELEASE_NOTES_FILE"
    exit 1
fi

cp "$RELEASE_NOTES_FILE" "$RELEASE_DIR/RELEASE_NOTES.md"

echo "Release build completed successfully"
