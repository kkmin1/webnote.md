# Running integration (e2e) tests

## One-time setup

Create a `.env` file in the project root:

```
APP_URL=http://localhost:3000
API_URL=http://localhost:8080
TOKENS_DIR="<PATH_TO_YOUR_FILES.MD_REPO/storage/-1"
CERT_DIR=""
TOKENS_SALT=""
```

`APP_URL` is where Playwright serves the webapp (`tests/playwright.config.js` starts `npx http-server ../web -p 3000`). `API_URL` is where the Go server listens; the tests point the browser at it via `localStorage.setItem('apiUrl', ...)` in `setup()`.

## Commands

All commands are defined in the project root `Makefile`.

| Command | What it does |
|---|---|
| `make e2e` | Headless run of every spec. Kills any stray `server`, starts a fresh one in the background, then runs `npm run test` in `tests/`. |
| `make e2e test="name"` | Same as above, but filters by test name (passed to Playwright as `-g "name"`). |
| `make e2eh` | Headed run - same as `e2e` but opens a visible browser window (`npm run test:headed`). Good for debugging visually. |
| `make e2eh test="name"` | Headed run filtered by name. |
| `make e2es test="name"` | Single-test headless run **without restarting the server**. Assumes a server is already running. Useful when iterating on one test against an already-warm server. |
| `make e2esh test="name"` | Same as `e2es` but headed. |

The `test="..."` value is a substring / regex matched against test titles (`test('…')` names in the spec files).

## Where test data lives

Every test-generated artifact goes under `storage/<WORKER_INDEX>/` at the project root. Playwright runs tests in parallel (8 workers by default; see `tests/playwright.config.js`), and each worker's server-side user storage is isolated by its worker ID:

- `storage/0/`, `storage/1/`, …, `storage/7/` - per-worker user filesystems. `tests/sync.spec.js` `beforeEach` wipes and recreates the current worker's directory on every test, so state never leaks between tests.
- `storage/-1/` - shared tokens directory. Contains one file per worker, named by `sha256(workerIndex + salt)`, whose contents are the worker's user ID. Used by the server's token middleware to authenticate incoming sync requests from the test browser.

Feel free to delete `storage/` whenever - it's rebuilt on the next `beforeEach`.
