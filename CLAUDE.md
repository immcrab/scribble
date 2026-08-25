# Agent instructions

## Clean up build artifacts after testing

`frontend/node_modules` and `frontend/dist` (same for `worker/`) are not
meant to persist in this repo — both are gitignored and regenerate on
demand.

If you install dependencies or run a build (`npm install`, `npm run build`,
`npm run dev`, etc.) only to test or verify a change, clean up when done:

- After verification finishes, delete `node_modules` and `dist` if you
  created them for that session and the user hasn't asked to keep a dev
  server running.
- Next time you need them, reinstall (`npm install`) / rebuild
  (`npm run build`) fresh — don't assume a stale copy is still correct.
- Don't delete `node_modules` while a dev server you started is still
  running, or if the user is actively working in the project (e.g. mid dev
  session) — only clean up your own scratch installs.
