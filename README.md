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
bun install --frozen-lockfile
uv sync --project backend --frozen --python 3.12
NEXT_PUBLIC_BASE_PATH="" bun run dev   # serve at http://localhost:5173/
bun run test:ci                        # unit and local US integration tests
bun run test:backend                   # accounting and HTTP tests
bun run build                          # production bundle
```

Setting `NEXT_PUBLIC_BASE_PATH=""` drops the `/us/marriage` prefix so the dev
server serves at the root — matches the Oregon Kicker convention.

## US childcare, early education and disability

US calculations use the app-owned [household backend](backend/README.md), pinned
to PolicyEngine US 1.824.1. UK policy calculations still use the public v1 API,
through the same backend, which applies the calculator’s rent accounting. Set
`NEXT_PUBLIC_US_API_URL=http://127.0.0.1:8012` to use a local backend for both
countries in development. Production defaults to the deployed Modal service and
rejects responses whose model version differs from the committed metadata.

Paid childcare costs feed into the estimates automatically. The funded-slot
assumption controls whether an otherwise eligible family receives CCDF; turning
it off retains gross childcare expenses and their other tax/benefit effects.
The calculator covers all 50 states and DC, with county, provider, attendance,
and parent work inputs. Children and their care costs remain with the first
adult in the separate-household comparison.

CCDF is counted once as the reduction in family childcare spending. State
payments already in aggregate benefits are replaced by that household benefit;
full provider payments remain visible separately. Care costs are deducted once,
so the net effect on income is the family's modeled out-of-pocket cost.
Vermont assumes providers collect the model-computed family share, even when
state payments exceed the entered price. The runtime preserves that expense
in affected tax and benefit deductions. Work hours remain editable for every
US household because they can affect benefits beyond childcare.
Initial-applicant, standard-quality,
zero-assets and available-funding assumptions apply unless an input says otherwise.

Head Start and Early Head Start eligibility are shown separately from their
estimated service values. Healthcare and early education values are always
separate from household financial resources and added only in the explicitly
labeled combined-resources comparison. Head Start values use state spending
per enrollee and assume eligible participation. Employer insurance affects
eligibility inputs, independently of this presentation. Actual Head Start enrollment is a separate childcare
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

## Accounting and release checks

The backend returns versioned, reconciled annual series for every household
and income-grid point. The browser displays these series without adjusting
childcare benefits, service values, or rent again. Financial resources include
benefits such as SNAP; they are not a cash-only measure. The original model
outputs remain available separately in the API response.

The [test workflow](docs/testing.md) checks the pinned runtime and frontend on
every pull request. The UK model’s external integration checks run separately.
Requests time out after two minutes and are cancelled when inputs change.
Failed charts retain the household comparison and offer a chart-only retry.
