# Lofin project instructions

## Preserve product modes and features

Do not remove, retire, hide, disable, or otherwise reduce any user-facing mode
or feature unless the user explicitly asks for that specific change. This
includes Direct, Battle, Agent, Side by Side, Image, and Text to Speech modes,
along with their UI entries, routes, and Worker APIs. Treat an existing feature
as intentional even if it appears unused or costly. If a change might affect a
feature's availability, ask the user before proceeding.

## Bump the app version on every change

The sidebar shows the app version (top left, right of the Lofin logo). Its single
source of truth is `"version"` in `frontend/package.json`; `vite.config.ts` injects
it as `__APP_VERSION__`. Every time you make a change to this repo, bump that
version before finishing: patch (`1.0.0` -> `1.0.1`) for fixes and small tweaks,
minor for new features, major for breaking changes. Never leave a change
un-bumped, and don't hardcode the version anywhere else.
