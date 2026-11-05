# Hacker News Hide Seen

A Firefox extension that helps you focus on the new content on HackerNews.

## Install In Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on**.
3. Select `manifest.json` from this folder, or `hackernews-hide-seen.xpi`.
4. Open or reload <https://news.ycombinator.com/>.

Temporary add-ons are removed when Firefox restarts. Permanent installation in
standard Firefox requires signing through Mozilla Add-ons. This package is unsigned.

## Controls

- **Pause** unchecked (default): marks stories normally.
- **Pause** checked: stops all new marks, including hover, scrolling, clicks, and direct discussion-page visits. Existing seen posts keep their display state.
- **Clear seen**: clears history and resets dimming, keeping the Pause preference.
- **Export seen.json**: opens Firefox's save dialog for a JSON snapshot of the hashes.

Seen stories and their metadata are dimmed in place with a short opacity
transition. Unless paused, opening a title or its comments/age link marks the
story as seen. Clicking **More** marks every story on the current page before
navigating to the next page.

On desktop, hover marking applies only to title links on story lists, not domains
or metadata. Mouse movement is required to mark a title.

On mobile, a story is marked while its title row overlaps the upper part of
the visible viewport. This applies on initial load, when scrolling in either
direction, and when returning to an active tab. Stories wholly above the screen
or below the upper 20% are not marked by this rule.

At the bottom on mobile, remaining there for eight seconds marks all visible stories
loaded on the current page, including any skipped earlier.

Resuming marks stories currently in the upper 20%, without marking posts you
scrolled past while paused. At the bottom it starts a fresh eight-second timer.
After clearing history, normal tracking resumes immediately unless paused.

History and Pause are saved and shared across open Hacker News tabs.
The former `mode`, `onlyVisited`, and `markOnHover` preferences are no longer used.

## Storage And Privacy

History is stored in `browser.storage.local` in your Firefox profile.

Story URLs are normalized by the URL parser and have their fragments removed,
then are hashed with SHA-256. The same URL across multiple submissions shares a seen state. Only hashes and the toggle preferences are persisted.

The content script runs only on HTTPS Hacker News pages.

## Develop

Run `npm test` for the unit tests followed by the webpack build. The
`web-ext-plugin` runs Firefox extension linting and writes the package to
`web-ext-artifacts/hackernews-hide-seen.zip`. Run `npm run build` to lint and
package without running the unit tests. Compiled extension files are written
to `dist/`.