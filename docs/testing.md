# Calculator checks

Install the committed dependency versions before running checks:

```sh
bun install --frozen-lockfile
uv sync --project backend --frozen --python 3.12
```

`bun run test:ci` starts the checkout's pinned US backend on an available local
port, waits for the matching model version, runs frontend unit and US integration
tests, and stops the server. It does not depend on a deployed API. The standard
suite rejects external requests and calls to the UK proxy. One Vitest worker
runs at a time because individual tests already submit multiple model grids.

Run the Python tests separately with `bun run test:backend`. The checked-in
GitHub Actions workflow runs both suites, backend formatting and lint, frontend
lint, and a production build for pull requests and pushes to main.

For a focused frontend check, pass test paths to the same local runner:

```sh
bun run test:ci tests/request-recovery.test.jsx tests/api.test.js
```

## Optional UK integration checks

`bun run test:live:uk` starts the current checkout's backend and runs the UK
integration suites through its UK adapter. These tests call the external public
PolicyEngine UK model, so their availability and results depend on that service.
They run separately from standard CI. To run them in GitHub Actions, dispatch
the separate **Live UK integration checks** workflow.

The optional suites include the UK API shape, household-input effects, and
combined-input reconciliation checks. Standard CI retains UK input construction,
mocked API handling, and UI tests without external requests.

The historical `tests/audit-values.test.js` compares older generated numeric
fixtures and remains outside the standard suite, as before this workflow. Use
current pinned-runtime integration checks for the release gate; fixture audits
require confirming that their generator and model version match first.
