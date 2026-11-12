# Marriage calculator household API

This app-owned service runs `policyengine-us==1.824.1`, verified against the
[PyPI release](https://pypi.org/project/policyengine-us/1.824.1/) on September 8,
2026. The model and transitive dependencies are pinned by `uv.lock`. The public
v1 API's older model does not yet expose the same nationwide childcare programs
and current Head Start household treatment. UK calculations use the public v1
model through this service's fixed upstream proxy.

From the repository root:

```sh
uv sync --project backend --frozen
uv run --project backend uvicorn backend.web:web_app --port 8012
uv run --project backend pytest backend/tests
uv run --project backend python -m backend.simulation --metadata /tmp/marriage-current-metadata.json
```

`POST /us/calculate` accepts:

```json
{"household": {"people": {}, "families": {}, "marital_units": {}, "tax_units": {}, "spm_units": {}, "households": {}}, "include_head_start_benefits": false}
```

Populate those entity collections with the existing v1 household shape. Set a
variable's annual value to `null` to request its calculated result. The response
is `{ "status": "ok", "result": <same household with outputs filled>,
"model_version": "1.824.1" }`. One or two employment-income axes return arrays
for each requested entity; the first axis varies fastest. Annual requests for
monthly money variables sum the 12 months through the model; annual categorical
inputs are dispatched to each month through the model's input rules.

Without versioned accounting, `include_head_start_benefits` controls the model's parameter for counting the
noncash value of Head Start and Early Head Start in net income. It does not
change the programs' calculated eligibility or amounts. Arbitrary reforms are
not accepted.

Add `"accounting_version": 1` to receive an `accounting` object alongside the
raw model `result`. Its `series` contains annual numeric arrays aggregated to
the household: one value for a scalar request, or one per income-axis point.
Boolean outputs are numeric counts. The object also identifies its `version`,
calculation `year`, `model_version`, and `axis_order: "first_axis_fastest"`.

The accounting separates `financial_resources`, `healthcare_service_value`,
and `early_education_service_value`. Their sum is `combined_resources`.
`household_net_income` aliases financial resources, while
`household_net_income_including_health_benefits` adds only healthcare value.
Head Start and Early Head Start remain available as `head_start_service_value`
and `early_head_start_service_value`; their financial-benefit entries are zero.
This version does not change when `include_head_start_benefits` changes.

Financial resources equal model `household_market_income`, plus normalized
`household_benefits` and `household_refundable_tax_credits`, less
`household_tax_before_refundable_credits`, `household_health_costs`, and
`childcare_cost_deducted`. The benefits exclude healthcare/education service
values and replace state childcare payments with the reduction in family
spending. The accounting resolves state-benefit composition from the model's
parameters for the requested year. `childcare_provider_payment` preserves the
full payment, `child_care_subsidies` is the recognized spending reduction,
`childcare_out_of_pocket` is the model's actual family cost, and
`childcare_cost_deducted` is that cost plus the recognized subsidy. This deducts
childcare once, including Vermont's collectible family share.

`POST /uk/calculate` accepts `household` and optional `accounting_version: 1`.
It sends the UK entity shape to the Public API's `/uk/calculate`
(`https://api.policyengine.org` unless `POLICYENGINE_API_URL` names another)
with this backend's own credential (see below) and a 110-second upstream
timeout, less any time spent getting a token. Its versioned series subtracts entered rent from
net income only for renters, exposes that deduction as `rent_deducted`, and
aliases the result as `financial_resources` and `combined_resources`. This
preserves the calculator's existing UK rent treatment; the proxy applies no
new policy rules. Original upstream model results remain in `result`.

Send `ccdf_participation_filter: true` when a funded childcare slot is available.
The filter immediately returns for households outside Vermont. Vermont's
model eligible-child set also determines participating children for payments
and copayment allocation. The adapter calculates the model's monthly eligibility
for every person, then restricts participation to those with positive entered
`pre_subsidy_childcare_expenses`. It preserves all model eligibility tests and
never forces an ineligible child eligible. The flag changes only simulation
inputs, not shared model definitions. Explicit Vermont child eligibility inputs
are rejected when this filter is enabled.

The same Vermont adapter assumes providers collect the model-computed family
share. For each month, actual childcare expense is the larger of zero, gross
price less the provider payment, and the collectible family share when a funded
payment and positive paid-care expenses exist. The adapter sums those amounts
into the model's annual `childcare_expenses` input, so SNAP deductions and CDCC
expense allocation use the corrected cost. Raw provider payments and the
model's `vt_ccfap_family_share` remain unchanged outputs. A zero final state
payment for an unavailable funded place preserves the family's gross expenses.

`GET /us/metadata` exposes all variables and the parameter values needed to
resolve aggregate composition. `?full=true` additionally exposes documentation
and all scalar parameters. `GET /health` returns the pinned model version.
All requested calculations must succeed: invalid inputs return 422; calculation
errors return 500 with the variable name. No missing results become zero.

Requests support one household, at most 12 people, 512 requested outputs, one
year from 2022 through 2035, and at most two axes of 33 points each. The JSON body
limit is 256 KiB. The service neither stores nor logs household inputs.

## Public API credential

The UK proxy sends this backend's own Auth0 client-credentials token to the
Public API in `Authorization: Bearer`. The Modal secret
`marriage-household-api-policyengine-api` (workspace `policyengine`) provides
five variables at run time:

| Variable | Production value |
| --- | --- |
| `POLICYENGINE_API_URL` | `https://api.policyengine.org` |
| `POLICYENGINE_API_AUTH0_DOMAIN` | `policyengine-api.uk.auth0.com`, a host name without a scheme |
| `POLICYENGINE_API_AUTH0_AUDIENCE` | `https://api.policyengine.org/` |
| `POLICYENGINE_API_AUTH0_CLIENT_ID` | the `marriage-household-api (Modal)` client |
| `POLICYENGINE_API_AUTH0_CLIENT_SECRET` | that client's secret |

`modal_app.py` attaches the secret to `HouseholdAPI`, and deploying fails if
the secret or any of its five keys is missing. `public_api_token.py`, copied
from the policyengine-api-access skill, requests one token and keeps it until
five minutes before it expires (tokens last 24 hours): in memory, and in the
Modal Dict `marriage-household-api-public-api-token`, which the first UK
request creates if it does not exist yet. So containers share one token
instead of each asking Auth0 for its own. Only the token and its replacement
time are stored.

A token request that Auth0 refuses, redirects, breaks off or answers without a
token, or that times out, returns the usual 500 "unavailable" error and sends
nothing to the Public API. The 10-second token timeout and the 110-second
upstream timeout apply to each connection and each read, not to the whole
request.
A 401 from the Public API is logged with the client ID and is never answered
with a new token, which would be refused too; check that the client is on the
Public API's `PUBLIC_API_SERVER_CLIENT_IDS` and that its tenant and audience
match. Neither the client secret nor the token is logged.

Outside Modal, without any of the five variables, as in local runs and the
manual live UK workflow, the proxy calls `https://api.policyengine.org`
without a credential, which the Public API serves until it requires one.
Inside a Modal container the five are required, so empty values in the secret
fail every UK request instead of silently dropping the credential. Setting
only some of them is refused everywhere, and so is a `POLICYENGINE_API_URL`
that is not an https URL. Each of these failures is a 500 whose log names the
variables and no value.

Containers restored from a memory snapshot keep the environment the snapshot
was taken with, so redeploy after changing the secret. To stop using a token
before it expires, clear the Dict
(`modal dict clear marriage-household-api-public-api-token`) and redeploy.

Don't run `modal serve` on this app. It attaches the same production secret
and token Dict, so code under development would call the production Public API
with the production client. No staging client exists for this backend.

## Deployment

Deploy with the intended PolicyEngine Modal workspace selected:

```sh
env -u MODAL_TOKEN_ID -u MODAL_TOKEN_SECRET uv run --project backend modal deploy backend/modal_app.py
```

Read the actual endpoint URL from that command's output. The app uses 2 CPUs and
8 GiB per container, at most 8 containers, three simultaneous requests per
container, and a 120-second timeout. No container runs while the app is idle:
containers scale down after 300 seconds without requests, so the first request
after that waits for a cold start. Memory snapshots retain the initialized
model for those cold starts, so a new container restores it instead of
rebuilding it.
