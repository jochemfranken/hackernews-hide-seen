# GitHub Releases

GitHub Actions runs `npm test` on pull requests to `main` and pushes to `main`.

To publish a release, tag a commit that is on `main` with a semantic version such
as `v1.2.3`, then push the tag:

```sh
git switch main
git pull --ff-only
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3
```

The workflow accepts `vMAJOR.MINOR.PATCH` tags, verifies the tagged commit is
reachable from `main`, sets the extension manifest version from the tag, runs
the build and Firefox extension lint, and creates a GitHub Release with
`hackernews-hide-seen-v1.2.3.zip` attached. The ZIP is unsigned; permanent
Firefox installation requires Mozilla signing.
