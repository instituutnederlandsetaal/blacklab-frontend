# Branches and tags

- `main` points to the commit tagged with the latest stable release. Stable tags have the form `X.Y.Z`, for example `5.0.0`.
- `dev` is the development branch for the next stable release.
- `experimental` contains larger rewrites. Merge features into `dev` when they are ready for a stable release.
- `v<major>-maintenance` holds backports for a release line. Create it when the first backport needs one.

# Creating releases

## Create a new mainline release

Start on a clean, full checkout of `dev` with Git, Python 3.10+, Java 17 or later, Maven, Node.js and npm installed.

```sh
python scripts/release.py --push
```

1. The script fetches branches and tags from `origin` and offers a patch, minor or major bump from the highest stable tag in the branch's history. For `5.0.0` from `4.3.0`, choose `major`.
2. It opens `docs/src/060_release_notes/X.Y.Z.md` in your Git editor. Organize the commit list into release notes, then save and close the editor.
3. It updates the POM, frontend package and lockfile, then runs Maven verification, builds the docs and runs the Python tests. If a check fails, the edited notes and version changes stay in the checkout for inspection.
4. It creates a local release commit and tag, then pushes the tag, `dev` and `main` to `origin` in one atomic push. Both branch updates must fast-forward. Your local `main` can be pulled afterwards.

To prepare a release locally, run `git fetch origin --tags` followed by `python scripts/release.py`. The script prints the exact push command to use later. If the server rejects a push, all remote refs keep their previous values and the local release commit and tag remain available. After fixing a permissions issue, retry the printed push command. If a remote branch advanced, fetch and reconcile its changes before preparing a new release. Keep published tags fixed.

## Create a maintenance branch

Create the branch manually from the last stable tag for its major. For example, if the last 5.x release was `5.2.3`, run

```sh
git switch -c v5-maintenance 5.2.3
```

## Create a maintenance release

Switch to the maintenance branch, commit the backport and run `python scripts/release.py --push`. Choose a patch or minor bump. The script pushes the release branch and tag together. If the branch maintains the major currently tagged at `origin/main`, the same push also advances `main`. Merge applicable fixes and release notes back into `dev`.

# Automated builds

## 1. GitHub Releases

A new stable tag triggers the [release workflow](../.github/workflows/release.yml). It builds the WAR and publishes it with the release notes. Releases that include the customization API also attach its TypeScript declarations and npm tarball.

## 2. Docker images

The [Docker workflow](../.github/workflows/docker.yml) publishes the combined `instituutnederlandsetaal/blacklab-frontend` image for `linux/amd64`.

| Pushed Git ref | Docker image tags | BlackLab base tag |
| --- | --- | --- |
| `main` | `latest` | Major of the stable tag at the branch tip |
| `dev` | `dev` | `dev` |
| `experimental` | `experimental` | `dev` |
| Stable tag, e.g. `5.2.3` | `5.2.3`, `5.2`, `5` | `5` |

Set the repository Actions secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` to credentials with push access to the image. Disable the old Docker Hub automated build rules when enabling this workflow. Retrying an older release can move its floating major and minor image tags backwards.

To build locally, run `python scripts/build_docker.py <ref>` with a branch or tag from the table. The script clones that local ref into a temporary directory and loads the built image into Docker. Add `--push` to publish it after signing in. The proxy Dockerfile is available for manual builds.

## 3. Documentation site

The [Pages workflow](../.github/workflows/deploy-docs.yml) rebuilds the entire site when `main` advances. To publish preview changes or older maintenance tags between mainline releases, open **Publish versioned documentation**, click **Run workflow** and select **main**, or run `gh workflow run deploy-docs.yml --ref main`.

| Site path | Source |
| --- | --- |
| `/` | Stable tag at `origin/main` |
| `/<major>/<minor>/` | Highest stable patch tag for each major/minor from 4.3 onwards |
| `/dev/` | `dev` |
| `/next/` | `experimental` |
| `/versions/` | Index of the published versions and previews |

Each ref uses its own documentation and VitePress config. Use **GitHub Actions** as the Pages publishing source, allow the `main` branch in the `github-pages` environment, and keep the workflow on the default branch (`dev`) for manual runs. Pages reads the preview branches from GitHub, so push any pending preview fixes before triggering a build from `main`.

To preview the complete site locally, run `git fetch origin --tags`, `python scripts/build_docs.py`, then `python -m http.server --directory target/pages`. Open `http://localhost:8000/versions/`. Local builds use local preview branches when present. For everyday docs editing, run `npm ci` and `npm run docs:dev` in `docs`.
