# manage-version.ts Usage Instructions

## Overview
Interactive CLI tool for managing project versions across both `package.json` (frontend) and `pom.xml` (backend). Handles version bumps, releases, changelog generation, and git tagging.

---

## Requirements

- **Bun runtime** installed ([https://bun.sh](https://bun.sh))
- Git repository with clean working tree (no uncommitted changes)
- Bun will install deps automatically on first run
---

## Branching Model

### `main` branch
- **Purpose**: Production-ready code
- **Version format**: Tagged releases without `-SNAPSHOT` (e.g., `1.2.3`)
- **HEAD state**: Should always point to a tagged version commit
- **When to run script**: To create releases from merged features

### `dev` branch
- **Purpose**: Development/integration branch
- **Version format**: `-SNAPSHOT` versions (e.g., `1.3.0-SNAPSHOT`)
- **Typical workflow**: Contains next unreleased version
- **When to run script**: 
  - After merging features to bump to next development version
  - Before merging to `main` to create a release

---

## Preconditions

Before running the script, ensure:

1. **Clean working tree**
   ```bash
   git status  # Should show no uncommitted changes
   ```

2. **On correct branch**
   - For releases: Run on `dev` before merging to `main`
   - For version bumps: Run on `dev` after releases or feature merges

3. **Versions in sync**
   - `src/frontend/package.json` and `pom.xml` should have matching versions
   - Script will warn if versions differ but use the higher version

4. **Previous release tag exists**
   - Required for changelog generation
   - Tags should be version strings (e.g., `1.2.3`)

---

## What the Script Does

### Action 1: Update SNAPSHOT Version
**Purpose**: Bump to the next `-SNAPSHOT` version

**Process**:
1. Reads current version from `package.json` and `pom.xml`
2. Prompts to select version bump type:
   - **Patch**: `1.2.3-SNAPSHOT` → `1.2.4-SNAPSHOT` (bug fixes)
   - **Minor**: `1.2.3-SNAPSHOT` → `1.3.0-SNAPSHOT` (new features)
   - **Major**: `1.2.3-SNAPSHOT` → `2.0.0-SNAPSHOT` (breaking changes)
3. Updates both version files
4. Creates git commit: `"Bump version to X.Y.Z-SNAPSHOT"`

**When to use**: After releasing or when starting work on the next version

---

### Action 2: Release
**Purpose**: Convert current `-SNAPSHOT` to a production release

**Process**:
1. Verifies current version is a `-SNAPSHOT`
2. Removes `-SNAPSHOT` suffix (e.g., `1.3.0-SNAPSHOT` → `1.3.0`)
3. Generates changelog:
   - Finds latest non-SNAPSHOT git tag
   - Extracts commits from that tag to HEAD
   - Opens changelog in your editor for manual curation
   - Lines starting with `#` are ignored (comments/instructions)
4. Updates `package.json` and `pom.xml` with release version
5. Creates git commit: `"Release version X.Y.Z"`
6. Creates git tag: `X.Y.Z`
7. **Automatically** runs "Update SNAPSHOT Version" to bump to next `-SNAPSHOT`

**When to use**: When ready to create a production release from `dev`

---

## Usage Examples

### Typical Release Workflow (dev → main)

```bash
# 1. On dev branch with version 1.3.0-SNAPSHOT
git checkout dev
git status  # Ensure clean

# 2. Run script to create release
bun scripts/manage-version.ts
# Select: [✓] Release
# Edit changelog when prompted
# Confirm push: Yes

# Result:
# - Commit: "Release version 1.3.0"
# - Tag: 1.3.0
# - Commit: "Bump version to 1.4.0-SNAPSHOT"
# - Pushed to remote

# 3. Merge to main and tag
git checkout main
git merge dev --ff-only  # Fast-forward merge to the release commit
git push
```

### Changing scope of next version, e.g. from Patch to Minor

```bash
# After a hotfix or when starting new features
git checkout dev

bun scripts/manage-version.ts
# Select: [✓] Update SNAPSHOT Version
# Choose: Minor (1.3.0-SNAPSHOT)
# Confirm push: Yes
```

### Creating Multiple Actions

```bash
bun scripts/manage-version.ts
# Select both:
# [✓] Update SNAPSHOT Version
# [✓] Release
```
*(Actions execute in order: Update, then Release)*

---

## Safety Features

### Automatic Rollback
- **Checkpoint created** at script start using git tag `VERSION_BUMP_CHECKPOINT`
- **Ctrl+C handling**: Restores to checkpoint on user interruption
- **Error handling**: Automatic rollback if script fails
- **Tag cleanup**: Removes checkpoint tag on successful completion

### Manual Recovery
If script fails unexpectedly without cleanup:
```bash
# Check if backup tag exists
git tag | grep VERSION_BUMP_CHECKPOINT

# Manually restore if needed
git reset --hard VERSION_BUMP_CHECKPOINT
git tag -d VERSION_BUMP_CHECKPOINT

# Remove created release tag if necessary
git tag -d 1.3.0
```

---

## Editor Configuration

The script uses your configured editor for changelog editing:

1. **VS Code** (if running in VS Code terminal): `code --wait`
2. **Git editor**: Value from `git config core.editor`
3. **Fallback**: System default application for `.md` files

To set your preferred editor:
```bash
git config --global core.editor "vim"
# or
git config --global core.editor "code --wait"
```

---

## Common Workflows

### Feature Complete on Dev
```bash
git checkout dev
# Ensure version is X.Y.Z-SNAPSHOT
bun scripts/manage-version.ts
# Select: Release
# Creates X.Y.Z tag and bumps to X.Y+1.0-SNAPSHOT
```

### Hotfix on Main
```bash
git checkout main
git checkout -b hotfix-1.2.4
# Apply fixes
bun scripts/manage-version.ts
# Select: Update SNAPSHOT Version → Patch
# Select: Release
# Merge hotfix to main and back to dev
```

### Major Version Bump
```bash
git checkout dev
bun scripts/manage-version.ts
# Select: Update SNAPSHOT Version → Major
# Creates 2.0.0-SNAPSHOT
```

---

## Troubleshooting

**Error: "Uncommitted changes"**
- Commit or stash changes before running

**Error: "No previous release tag found"**
- Create an initial version tag manually: `git tag 1.0.0 <commit>`

**Inconsistent versions warning**
- Script uses the higher version
- Manually verify and fix discrepancies if needed

**Script hangs on editor**
- Save and close the changelog editor to continue
- Ensure editor is configured correctly (see Editor Configuration)

---

## Notes

- Always review changelog content before confirming
- The script keeps `package.json` and `pom.xml` synchronized
- Push is optional but recommended for team collaboration
- Tags are essential for changelog generation—keep them clean
