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
It sends the UK entity shape to `https://api.policyengine.org/uk/calculate` with
a 110-second upstream timeout. Its versioned series subtracts entered rent from
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

Deploy with the intended PolicyEngine Modal workspace selected:

```sh
env -u MODAL_TOKEN_ID -u MODAL_TOKEN_SECRET uv run --project backend modal deploy backend/modal_app.py
```

Read the actual endpoint URL from that command's output. The app uses 2 CPUs and
8 GiB per container, at most 8 containers, three simultaneous requests per
container, and a 120-second timeout. One container stays warm so browser CORS
preflights and the comparison's up-to-three calculation requests can reuse
the loaded model. Extra containers scale down after 300 seconds idle.
Memory snapshots retain the initialized model for subsequent cold starts.
