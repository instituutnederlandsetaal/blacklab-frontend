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

# Copy release notes
RELEASE_NOTES_FILE="docs/src/060_release_notes/${VERSION}.md"
if [ ! -f "$RELEASE_NOTES_FILE" ]; then
    echo "Error: Release notes file not found: $RELEASE_NOTES_FILE"
    exit 1
fi

cp "$RELEASE_NOTES_FILE" "$RELEASE_DIR/RELEASE_NOTES.md"

echo "Release build completed successfully"