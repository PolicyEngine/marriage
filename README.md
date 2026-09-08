# marriage

Marriage penalty and bonus calculator for the US and UK tax and benefit
systems, powered by the PolicyEngine API.

Production URL: <https://policyengine.org/us/marriage>

## Multizone deployment

The app is a Next.js app-router project deployed as a Vercel multizone.
It runs under `basePath: "/us/marriage"` and is routed first-party at
`policyengine.org/us/marriage` via `beforeFiles` rewrites in the
[policyengine-app-v2 host](https://github.com/PolicyEngine/policyengine-app-v2).
The UK route (`/uk/marriage`) reuses the same zone with `?country=uk`
forwarded to the server component; see `app/page.jsx`.

## Development

```sh
bun install
NEXT_PUBLIC_BASE_PATH="" bun run dev   # serve at http://localhost:5173/
bun run test:ci                        # component and live API tests
bun run build                          # production bundle
```

Setting `NEXT_PUBLIC_BASE_PATH=""` drops the `/us/marriage` prefix so the dev
server serves at the root — matches the Oregon Kicker convention.

## US childcare, early education and disability

US calculations use the app-owned [household backend](backend/README.md), pinned
to PolicyEngine US 1.824.1. UK calculations use the public v1 API. Set
`NEXT_PUBLIC_US_API_URL=http://127.0.0.1:8012` to use the local US backend for
development or tests. Production defaults to the deployed Modal service and
rejects responses whose model version differs from the committed metadata.

Paid childcare costs feed into the estimates automatically. The funded-slot
assumption controls whether an otherwise eligible family receives CCDF; turning
it off retains gross childcare expenses and their other tax/benefit effects.
The calculator covers all 50 states and DC, with county, provider, attendance,
and parent work inputs. Children and their care costs remain with the first
adult in the separate-household comparison.

CCDF is counted once: its contribution already included in state benefits is
removed from that breakdown row, while missing state contributions are added
to household benefits and net income. Gross care costs are then deducted once.
Out-of-pocket cost is gross cost minus the model subsidy, floored at zero;
provider payments can exceed entered charges under some state rules. This is
not labeled as a statutory copayment. Initial-applicant, standard-quality,
zero-assets and available-funding assumptions apply unless an input says otherwise.

Head Start and Early Head Start eligibility are shown separately from their
estimated service values. Those noncash values are excluded from net income
unless explicitly selected; they use state spending per enrollee and assume
eligible participation. Actual Head Start enrollment is a separate childcare
input. The SSI medical-disability checkbox sets both
`meets_ssi_disability_criteria` and `is_disabled`; financial eligibility remains
model-computed.

Metadata is committed with the matching runtime, rather than overwritten by
the older public API during every build. To refresh variables, county options,
provider enums and aggregate composition after reviewing a model update:

```sh
uv run --project backend python -m backend.simulation --metadata /tmp/marriage-metadata.json
US_METADATA_FILE=/tmp/marriage-metadata.json bun run metadata
```
