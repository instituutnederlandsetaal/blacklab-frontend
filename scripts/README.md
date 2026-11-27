# Branches and Tags

BlackLab-Frontend uses a specific branch setup for maintenance and development. 
### Branches
- `main` points to the latest stable release tag.
- `dev` is the development branch for the next stable release.
- `experimental` contains larger rewrites not yet ready for stable release. 
  It may contain incomplete or experimental features.
- `v<major>-maintenance` branches for maintenance of older releases.
  Maintenance branches are created on demand, so not all major releases have a corresponding maintenance branch.
- `<major>.<minor>.<patch>` tags for releases

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

When run without `--push`, the script does not run a `fetch`, and does not push anything. 
It will instead print the command to manually push the release commit and tag to the remote repository. That will fail if your local branch was out of date

## Create a maintenance branch

Check out the last stable tag for the major release you want to maintain. For example, if you are creating a `v5-maintenance` branch and the last stable release was `5.2.3`, run:
   ```sh
   git switch -c v5-maintenance 5.2.3
   ```

## Create a maintenance release

Check out the correct maintenance branch first. For example, if you are creating a maintenance release for `5`, run:
```sh
git switch v5-maintenance
```
Apply your fixes and backports. 
Then run 
```sh
python scripts/release.py --push
```


# Automated Builds

There are 3 automated builds.
These run on Github, depending on various triggers.


## 1. Github Releases

- Triggers on pushed tags matching the version pattern (`<major>.<minor>.<patch>`)
- Builds the `.war` 
- Creates a Github release with the corresponding release notes and artifacts.

See `.github/workflows/release.yml` for the detailed workflow configuration.


## 2. Docker Images

- Runs on Github
- Triggers on specific branches, as well pushed tags matching the version pattern (`<major>.<minor>.<patch>`)
- Builds and pushes the corresponding Docker images to Docker Hub.
- Only pushes `linux/amd64` images currently.

See `.github/workflows/docker.yml` for the detailed workflow configuration.

Here is a table showing what git branches and tags correspond to which Docker images:
<table>
  <thead>
    <tr>
      <th>Git branch</th>
      <th colspan="3">Docker image tag(s)</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>main</td>
      <td colspan="3">latest</td>
    </tr>
    <tr>
      <td>dev</td>
      <td colspan="3">dev</td>
    </tr>
    <tr>
      <td>experimental</td>
      <td colspan="3">experimental</td>
    </tr>
  </tbody>
  <thead>
    <tr>
      <th>Git  tag</th>
      <th colspan="3"></th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>5.2.3</td>
      <td>5.2.3</td>
      <td>5.2</td>
      <td>5</td>
    </tr>
    <tr>
      <td>4.3.2</td>
      <td>4.3.2</td>
      <td>4.3</td>
      <td>4</td>
    </tr>
  </tbody>
</table>

To build locally, run `python scripts/build_docker.py <ref>`. 
The script clones into a temp dir and builds and tags the image from there. 
Use `--push` to also publish to dockerhub. 

## 3. Documentation site

- Runs on Github
- Runs on the `main` branch only (so on new releases in practice).
- Builds and deploys the Vitepress documentation site to the live documentation site.

See `.github/workflows/deploy-docs.yml` for the detailed workflow configuration.

The docs build script builds the documentation for the `main`, `dev`, and `experimental`, as well as all major+minor versions from `4.3.0` onwards. It combines the results into a single site. It should automatically pick up new tags, but the branches are hardcoded. Changes to the branch list require an update of the script.

| Site path | Source |
| --- | --- |
| `/` | Stable tag at `origin/main` |
| `/<major>/<minor>/` | Highest stable patch tag for each major/minor from 4.3 onwards |
| `/dev/` | `dev` |
| `/next/` | `experimental` |
| `/versions/` | Index of versions (generated from build script) |

To preview the complete site locally, run `git fetch origin --tags`, `python scripts/build_docs.py`, then `python -m http.server --directory target/pages`. Open `http://localhost:8000/versions/` to browse the local builds. For everyday docs editing, run `npm ci` and `npm run docs:dev` in `docs`.

Set GitHub Actions secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` to an account authorized to push the image. The Docker workflow must be present on each publishing branch, including `experimental` and release maintenance branches. Disable the old Docker Hub automated build rules when enabling the workflow. Retrying an older release may move its floating `X.Y` and `X` tags backwards. The proxy Dockerfile is available for manual builds.
