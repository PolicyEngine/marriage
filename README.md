# marriage

Marriage penalty and bonus calculator for the US and UK tax and benefit
systems, powered by the PolicyEngine API.

Production URL: <https://policyengine.org/us/marriage>

## Multizone deployment

The app is a Next.js 14 app-router project deployed as a Vercel multizone.
It runs under `basePath: "/us/marriage"` and is routed first-party at
`policyengine.org/us/marriage` via `beforeFiles` rewrites in the
[policyengine-app-v2 host](https://github.com/PolicyEngine/policyengine-app-v2).
The UK route (`/uk/marriage`) reuses the same zone with `?country=uk`
forwarded to the server component; see `app/page.jsx`.

## Development

```sh
bun install
NEXT_PUBLIC_BASE_PATH="" bun run dev   # serve at http://localhost:5173/
bun run test:ci                        # component + API tests (76)
bun run build                          # production bundle
```

Setting `NEXT_PUBLIC_BASE_PATH=""` drops the `/us/marriage` prefix so the dev
server serves at the root — matches the Oregon Kicker convention.
