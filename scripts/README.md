# Release automation

`manage-version.js` is a command line tool to streamline the release process.

It will ask if you're making a release or just bumping the snapshot version. It will perform various checks, then update the version numbers in all relevant files.

If you're making a release, it will also generate a changelog based on git commits since the last semver tag, and open it in your text editor for you to edit. Once you're done, it will move the changelog to the docs folder and commit the changes with a new git tag.

The rest of the release process is handled by GitHub Actions and Docker Hub. Once the new tag is pushed, the GitHub workflows will automatically create a new release on GitHub, using the changelog created above. Docker Hub also detects the new tag and builds a new Docker image based on it. It will ensure that the correct BlackLab base image is used, depending on the major version of the release.
