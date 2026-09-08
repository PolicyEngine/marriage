import { getCountry, DEFAULT_BRMA } from "./countries";
import { addUSChildcareInputs, US_CHILDCARE_OUTPUTS, US_CHILDCARE_SERIES } from "./childcare";

const US_API_BASE = "https://policyengine--marriage-household-api-householdapi-api.modal.run";

// ---------- per-country computed data (cached) ----------

const _cache = {};

function countryData(countryId) {
  if (_cache[countryId]) return _cache[countryId];
  const country = getCountry(countryId);
  const m = country.metadata;
  const allDetailVars = [
    ...m.benefits,
    ...(m.credits || []),
    ...m.taxes,
    ...(m.healthcare || []),
    ...(m.stateCredits || []),
    ...(m.stateTaxes || []),
  ];
  const allVars = [...allDetailVars, ...m.aggregates];
  if (countryId === "us") {
    allDetailVars.push(...US_CHILDCARE_OUTPUTS);
    allVars.push(...US_CHILDCARE_OUTPUTS);
  }

  // Group detail vars by entity type
  const detailByEntity = { person: [] };
  for (const key of Object.keys(country.entityContainers)) {
    detailByEntity[key] = [];
  }
  for (const v of allDetailVars) {
    if (detailByEntity[v.entity]) detailByEntity[v.entity].push(v.variable);
  }

  _cache[countryId] = { country, m, allDetailVars, allVars, detailByEntity };
  return _cache[countryId];
}

// ---------- state credit helpers (US only) ----------

function getStateCreditEntries(metadata, stateCode) {
  if (!metadata.stateCreditsByState) return [];
  const entries = metadata.stateCreditsByState[stateCode] || [];
  if (stateCode === "NY" && metadata.stateCreditsByState.NYC) {
    return [...entries, ...metadata.stateCreditsByState.NYC];
  }
  return entries;
}

// ---------- situation construction ----------

function createUSSituation(regionCode, headIncome, disabilityStatus, spouseIncome, children, year, pregnancyStatus, headAge, spouseAge, esiStatus, inNYC, extras = {}) {
  const cohabiting = spouseIncome !== null && extras.livingArrangement === "cohabiting";
  const members = ["you"];
  const maritalUnitMembers = ["you"];

  const people = {
    you: {
      age: { [year]: headAge },
      employment_income: { [year]: headIncome },
      own_children_in_household: { [year]: children.length },
      is_disabled: { [year]: disabilityStatus.head || false },
      is_pregnant: { [year]: pregnancyStatus.head || false },
      ...(esiStatus.head ? { has_esi: { [year]: true } } : {}),
    },
  };

  if (spouseIncome !== null) {
    people["your partner"] = {
      age: { [year]: spouseAge },
      employment_income: { [year]: spouseIncome },
      own_children_in_household: { [year]: children.length },
      is_disabled: { [year]: disabilityStatus.spouse || false },
      is_pregnant: { [year]: pregnancyStatus.spouse || false },
      ...(esiStatus.spouse ? { has_esi: { [year]: true } } : {}),
    };
    members.push("your partner");
    if (!cohabiting) maritalUnitMembers.push("your partner");
  }

  const maritalUnits = {
    "your marital unit": { members: [...maritalUnitMembers] },
    ...(cohabiting ? {
      "your partner's marital unit": {
        marital_unit_id: { [year]: children.length + 1 },
        members: ["your partner"],
      },
    } : {}),
  };

  children.forEach((child, i) => {
    const childId = `child_${i + 1}`;
    people[childId] = {
      age: { [year]: child.age },
      employment_income: { [year]: 0 },
      is_disabled: { [year]: child.isDisabled || false },
    };
    members.push(childId);
    maritalUnits[`${childId} marital unit`] = {
      marital_unit_id: { [year]: i + 1 },
      members: [childId],
    };
  });

  return addUSChildcareInputs({
    people,
    families: { "your family": { members: [...members] } },
    marital_units: maritalUnits,
    tax_units: cohabiting ? {
      "your tax unit": { tax_unit_id: { [year]: 0 }, members: members.filter(name => name !== "your partner") },
      "your partner's tax unit": { tax_unit_id: { [year]: 1 }, members: ["your partner"] },
    } : { "your tax unit": { members: [...members] } },
    spm_units: { "your spm_unit": { members: [...members] } },
    households: {
      "your household": {
        members: [...members],
        state_name: { [year]: regionCode },
        ...(inNYC ? { in_nyc: { [year]: true } } : {}),
      },
    },
  }, children, year, extras);
}

// UK-only inputs beyond wages. Each maps to a Universal Credit element or
// means-test component in policyengine-uk. `extras` is an object rather than
// more positional arguments because these are optional and country-specific.
//
// Entity placement is load-bearing: the API rejects `rent` on a person and
// `childcare_expenses` on a household. See policyengine_uk/variables.
export const UK_EXTRAS_DEFAULTS = {
  rent: 0,
  tenureType: "OWNED_OUTRIGHT",
  brma: DEFAULT_BRMA,
  savings: 0,
  childcareCosts: 0,
  carerStatus: {},
  pensionIncome: {},
  selfEmploymentIncome: {},
};

function createUKSituation(
  regionCode, headIncome, disabilityStatus, spouseIncome, children, year,
  headAge, spouseAge, extras = {},
) {
  const e = { ...UK_EXTRAS_DEFAULTS, ...extras };
  const members = ["you"];

  const people = {
    you: {
      age: { [year]: headAge },
      employment_income: { [year]: headIncome },
      self_employment_income: { [year]: e.selfEmploymentIncome.head || 0 },
      private_pension_income: { [year]: e.pensionIncome.head || 0 },
      is_disabled_for_benefits: { [year]: disabilityStatus.head || false },
      is_carer_for_benefits: { [year]: e.carerStatus.head || false },
    },
  };

  if (spouseIncome !== null) {
    people["your partner"] = {
      age: { [year]: spouseAge },
      employment_income: { [year]: spouseIncome },
      self_employment_income: { [year]: e.selfEmploymentIncome.spouse || 0 },
      private_pension_income: { [year]: e.pensionIncome.spouse || 0 },
      is_disabled_for_benefits: { [year]: disabilityStatus.spouse || false },
      is_carer_for_benefits: { [year]: e.carerStatus.spouse || false },
    };
    members.push("your partner");
  }

  children.forEach((child, i) => {
    const childId = `child_${i + 1}`;
    people[childId] = {
      age: { [year]: child.age },
      employment_income: { [year]: 0 },
    };
    // The childcare element is capped per child and only paid when the work
    // condition is met, so costs sit on the children who generate them.
    if (e.childcareCosts > 0 && children.length > 0) {
      people[childId].childcare_expenses = {
        [year]: e.childcareCosts / children.length,
      };
    }
    members.push(childId);
  });

  return {
    people,
    benunits: {
      "your benefit unit": {
        members: [...members],
        is_married: { [year]: spouseIncome !== null },
      },
    },
    households: {
      "your household": {
        members: [...members],
        country: { [year]: regionCode },
        rent: { [year]: e.rent || 0 },
        tenure_type: { [year]: e.tenureType },
        // Sets the Local Housing Allowance cap, which only applies to private
        // rent. The model defaults to Maidstone, so an unset area quietly
        // applies Kent rates to a London household.
        brma: { [year]: e.brma || DEFAULT_BRMA },
        savings: { [year]: e.savings || 0 },
      },
    },
  };
}

export function createSituation(
  countryId, regionCode, headIncome, disabilityStatus,
  spouseIncome = null, children = [], year,
  pregnancyStatus = {}, headAge = 40, spouseAge = 40,
  esiStatus = {}, inNYC = false, extras = {},
) {
  if (countryId === "uk") {
    return createUKSituation(regionCode, headIncome, disabilityStatus, spouseIncome, children, year, headAge, spouseAge, extras);
  }
  return createUSSituation(regionCode, headIncome, disabilityStatus, spouseIncome, children, year, pregnancyStatus, headAge, spouseAge, esiStatus, inNYC, extras);
}

// ---------- output variable injection ----------

function addOutputVariables(countryId, situation, year, regionCode) {
  const { m, detailByEntity, country } = countryData(countryId);
  const ec = country.entityContainers;

  // Aggregates — all are household-level
  const hh = situation.households["your household"];
  for (const v of m.aggregates) {
    hh[v.variable] = { [year]: null };
  }

  // Detail variables by entity
  if (detailByEntity.household) {
    for (const v of detailByEntity.household) hh[v] = { [year]: null };
  }

  for (const [entity, vars] of Object.entries(detailByEntity)) {
    if (entity === "household" || entity === "person") continue;
    const container = ec[entity];
    if (!container) continue;
    for (const target of Object.values(situation[container.key] || {})) {
      for (const v of vars) target[v] = { [year]: null };
    }
  }

  for (const personName of Object.keys(situation.people)) {
    const person = situation.people[personName];
    for (const v of (detailByEntity.person || [])) {
      person[v] = { [year]: null };
    }
  }

  // US-only: per-state credit variables
  if (countryId === "us" && regionCode) {
    for (const entry of getStateCreditEntries(m, regionCode)) {
      if (entry.entity === "person") {
        for (const person of Object.values(situation.people)) {
          person[entry.variable] = { [year]: null };
        }
      } else {
        for (const tu of Object.values(situation.tax_units)) {
          tu[entry.variable] = { [year]: null };
        }
      }
    }
  }

  return situation;
}

// ---------- API call ----------

async function callApi(countryId, situation, extras = {}) {
  const country = getCountry(countryId);
  const base = process.env.NEXT_PUBLIC_US_API_URL || US_API_BASE;
  const controller = new AbortController();
  const abort = () => controller.abort(extras.signal?.reason);
  if (extras.signal?.aborted) abort();
  else extras.signal?.addEventListener("abort", abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 120000);
  try {
    const res = await fetch(`${base}${country.apiPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ household: situation, accounting_version: 1,
        ...(countryId === "us" ? {
          ccdf_participation_filter: extras.ccdfSlotAvailable !== false,
        } : {}),
      }),
    });
    if (!res.ok) {
      throw new Error(`The calculation service could not complete this request (${res.status}). Please try again.`);
    }
    const data = await res.json();
    if (data.status === "error") throw new Error(data.message || "Calculation error");
    if (countryId === "us" && data.model_version !== country.metadata.modelVersion) {
      throw new Error("The calculation service uses a different model version. Please refresh and try again.");
    }
    const accounting = data.accounting;
    const required = new Set(["financial_resources", "healthcare_service_value", "early_education_service_value", "combined_resources",
      ...(countryId === "us" ? [...US_CHILDCARE_SERIES, "household_market_income", "household_health_costs"] : ["rent_deducted"]),
    ]);
    for (const [plural, entities] of Object.entries(situation)) {
      if (plural === "axes") continue;
      for (const entity of Object.values(entities)) {
        for (const [variable, periods] of Object.entries(entity)) {
          if (!Array.isArray(periods) && Object.values(periods || {}).includes(null)) required.add(variable);
        }
      }
    }
    const count = (situation.axes || []).reduce((n, group) => n * group[0].count, 1);
    if (accounting?.version !== 1 || accounting.axis_order !== "first_axis_fastest"
      || !accounting.series || [...required].some(variable => !Array.isArray(accounting.series[variable]))
      || Object.values(accounting.series).some(values => !Array.isArray(values)
        || values.length !== count || values.some(value => typeof value !== "number" || !Number.isFinite(value)))) {
      throw new Error("The calculation service returned incomplete results. Please refresh and try again.");
    }
    return { ...data.result, accounting };
  } catch (error) {
    if (timedOut) throw new Error("The calculation took too long. Please try again.");
    throw error;
  } finally {
    clearTimeout(timer);
    extras.signal?.removeEventListener("abort", abort);
  }
}

// ---------- extraction helpers ----------

// The API varies the first axis (You) fastest. Internally cells use
// headIdx * count + spouseIdx, so normalize both two-income scenarios once.
function normalizeIncomeGrid(array, count) {
  if (!count) return array;
  return Array.from({ length: count * count }, (_, idx) =>
    array[(idx % count) * count + Math.floor(idx / count)],
  );
}

function extractAllArrays(countryId, result, year, count = null) {
  if (!result) return {};
  // Accounting is performed once by the service, for scalars and every axis
  // point. The browser only changes the axis order used by the chart.
  return Object.fromEntries(Object.entries(result.accounting.series).map(
    ([variable, values]) => [variable, normalizeIncomeGrid(values, count)],
  ));
}

const ACCOUNTING_SERIES = [
  "financial_resources", "healthcare_service_value", "early_education_service_value",
  "combined_resources", "rent_deducted", "household_market_income", "household_health_costs", ...US_CHILDCARE_SERIES,
];

// ---------- separate-household extras ----------

// When the couple splits, the UK inputs have to be allocated between the two
// resulting households. Each choice here is an assumption, surfaced in the
// form's assumptions list:
//   rent        each household pays the rent entered, since both need a home.
//               The LHA cap in policyengine-uk already lowers the element for
//               a single person on a smaller entitlement.
//   savings     split evenly. This matters because entitlement is nil above
//               the upper capital limit, so a joint balance over the limit can
//               leave both singles under it.
//   childcare   follows the children, who are assigned to the head.
//   per-adult   carer status, pension income and self-employment income each
//               follow the adult they belong to.
export function splitExtras(extras = {}, who, overrides = {}) {
  const e = { ...UK_EXTRAS_DEFAULTS, ...extras };
  const pick = (m) => ({ head: (m || {})[who] || false });
  const pickNum = (m) => ({ head: (m || {})[who] || 0 });
  return {
    ...e,
    savings: (e.savings || 0) / 2,
    childcareCosts: who === "head" ? e.childcareCosts : 0,
    childcareWorkHours: pickNum(e.childcareWorkHours),
    carerStatus: pick(e.carerStatus),
    pensionIncome: pickNum(e.pensionIncome),
    selfEmploymentIncome: pickNum(e.selfEmploymentIncome),
    ...overrides,
  };
}

// ---------- housing costs ----------

// policyengine-uk's household_net_income adds household_benefits (which
// includes the UC housing element) and subtracts tax, but never subtracts
// rent. Comparing one household against two therefore credits two housing
// elements while charging no rent at all, which inflates the apparent gain
// from separating by roughly the cost of a second home. Report UK net income
// after housing costs so both sides of the comparison pay their own rent.
// At rent = 0 this is a no-op, so US behaviour and existing UK results with
// no rent entered are unchanged.
// Only renters have rent to deduct. uc_housing_costs_element pays nothing on
// an owned tenure, so deducting a rent figure there would take money off net
// income with no housing support to match it. Mortgage costs are not modelled.
export function isRentedTenure(tenureType) {
  return [
    "RENT_PRIVATELY",
    "RENT_FROM_COUNCIL",
    "RENT_FROM_HA",
  ].includes(tenureType || UK_EXTRAS_DEFAULTS.tenureType);
}

// ---------- public API ----------

export async function getPrograms(
  countryId, regionCode, headIncome, disabilityStatus,
  spouseIncome = null, children = [], year,
  pregnancyStatus = {}, headAge = 40, spouseAge = 40,
  esiStatus = {}, inNYC = false, extras = {},
) {
  const { m } = countryData(countryId);

  const situation = createSituation(
    countryId, regionCode, headIncome, disabilityStatus,
    spouseIncome, children, year,
    pregnancyStatus, headAge, spouseAge, esiStatus, inNYC, extras,
  );
  addOutputVariables(countryId, situation, year, regionCode);

  const result = await callApi(countryId, situation, extras);
  const series = extractAllArrays(countryId, result, year);
  const values = entries => Object.fromEntries(entries.map(entry => [entry.variable, series[entry.variable]?.[0] || 0]));

  // Per-state credits (US only)
  const stateCreditEntries = getStateCreditEntries(m, regionCode);
  const perStateDict = {};
  for (const entry of stateCreditEntries) {
    perStateDict[entry.label] = series[entry.variable]?.[0] || 0;
  }

  const aggregates = Object.fromEntries(Object.entries(getCountry(countryId).aggregateMap)
    .map(([key, variable]) => [key, series[variable]?.[0] || 0]));
  if (countryId === "us") aggregates.childcareCostDeducted = series.childcare_cost_deducted?.[0] || 0;
  else aggregates.rentDeducted = series.rent_deducted?.[0] || 0;

  return {
    aggregates,
    benefits: values(m.benefits),
    ...(countryId === "us" ? { childcare: childcareResult(variable => series[variable]?.[0] || 0, extras) } : {}),
    health: values(m.healthcare || []),
    credits: values(m.credits || []),
    stateCredits: m.stateCredits?.length
      ? {
          state_refundable_credits: series[m.stateCredits[0].variable]?.[0] || 0,
          ...perStateDict,
        }
      : {},
    taxes: values(m.taxes),
    stateTaxes: values(m.stateTaxes || []),
  };
}

export async function getCategorizedPrograms(
  countryId, regionCode, headIncome, spouseIncome, children,
  disabilityStatus, year, pregnancyStatus = {},
  headAge = 40, spouseAge = 40, esiStatus = {}, inNYC = false, extras = {},
) {
  const country = getCountry(countryId);
  const defAge = country.defaultAge;

  if (countryId === "us" && extras.livingArrangement === "cohabiting") {
    const [married, unmarried] = await Promise.all([
      getPrograms(countryId, regionCode, headIncome, disabilityStatus,
        spouseIncome, children, year, pregnancyStatus, headAge, spouseAge,
        esiStatus, inNYC, { ...extras, livingArrangement: "separate" }),
      getPrograms(countryId, regionCode, headIncome, disabilityStatus,
        spouseIncome, children, year, pregnancyStatus, headAge, spouseAge,
        esiStatus, inNYC, extras),
    ]);
    return { married, unmarried };
  }

  const [married, headSingle, spouseSingle] = await Promise.all([
    getPrograms(
      countryId, regionCode, headIncome, disabilityStatus,
      spouseIncome, children, year,
      pregnancyStatus, headAge, spouseAge, esiStatus, inNYC,
      extras,
    ),
    getPrograms(
      countryId, regionCode, headIncome, disabilityStatus,
      null, children, year,
      { head: pregnancyStatus.head || false }, headAge, defAge,
      { head: esiStatus.head || false }, inNYC,
      splitExtras(extras, "head"),
    ),
    getPrograms(
      countryId, regionCode, spouseIncome,
      { head: disabilityStatus.spouse || false },
      null, [], year,
      { head: pregnancyStatus.spouse || false }, spouseAge, defAge,
      { head: esiStatus.spouse || false }, inNYC,
      splitExtras(extras, "spouse", { childcareCosts: 0 }),
    ),
  ]);

  return { married, headSingle, spouseSingle };
}

// ---------- Heatmap API calls ----------

export async function getHeatmapData(
  countryId, regionCode, children, disabilityStatus, year,
  pregnancyStatus = {}, headIncome = 0, spouseIncome = 0,
  headAge = 40, spouseAge = 40, esiStatus = {}, inNYC = false, extras = {},
) {
  const { m, country } = countryData(countryId);
  const defAge = country.defaultAge;
  const cohabiting = countryId === "us" && extras.livingArrangement === "cohabiting";

  const rawMax = Math.max(80000, headIncome, spouseIncome);
  const step = Math.ceil(rawMax / 32 / 2500) * 2500;
  const maxIncome = step * 32;
  const count = 33;

  function buildHeatmapSituation(includeSpouse, childrenList, disability, pregnancy, hAge, sAge, esi, scenarioExtras) {
    const situation = createSituation(
      countryId, regionCode, maxIncome, disability,
      includeSpouse ? maxIncome : null, childrenList, year,
      pregnancy, hAge, sAge, esi || {}, inNYC, scenarioExtras,
    );
    addOutputVariables(countryId, situation, year, regionCode);

    if (includeSpouse) {
      situation.axes = [
        [{ name: "employment_income", count, index: 0, min: 0, max: maxIncome, period: year }],
        [{ name: "employment_income", count, index: 1, min: 0, max: maxIncome, period: year }],
      ];
    } else {
      situation.axes = [
        [{ name: "employment_income", count, min: 0, max: maxIncome, period: year }],
      ];
    }

    return situation;
  }

  const marriedSituation = buildHeatmapSituation(
    true, children, disabilityStatus, pregnancyStatus, headAge, spouseAge, esiStatus,
    { ...extras, livingArrangement: "separate" },
  );
  const headSingleSituation = buildHeatmapSituation(
    false, children, disabilityStatus,
    { head: pregnancyStatus.head || false }, headAge, undefined,
    { head: esiStatus.head || false },
    splitExtras(extras, "head"),
  );
  const spouseSingleSituation = buildHeatmapSituation(
    false, [], { head: disabilityStatus.spouse || false },
    { head: pregnancyStatus.spouse || false }, spouseAge, undefined,
    { head: esiStatus.spouse || false },
    splitExtras(extras, "spouse", { childcareCosts: 0 }),
  );

  const unmarriedSituation = cohabiting ? buildHeatmapSituation(
    true, children, disabilityStatus, pregnancyStatus, headAge, spouseAge,
    esiStatus, extras,
  ) : null;
  const [marriedResult, headResult, spouseResult, unmarriedResult] = await Promise.all([
    callApi(countryId, marriedSituation, extras),
    cohabiting ? null : callApi(countryId, headSingleSituation, extras),
    cohabiting ? null : callApi(countryId, spouseSingleSituation, extras),
    cohabiting ? callApi(countryId, unmarriedSituation, extras) : null,
  ]);

  // Extract all per-program arrays for click-to-detail
  const marriedData = extractAllArrays(countryId, marriedResult, year, count);
  const headData = extractAllArrays(countryId, headResult, year);
  const spouseData = extractAllArrays(countryId, spouseResult, year);
  const unmarriedData = extractAllArrays(countryId, unmarriedResult, year, cohabiting ? count : null);
  const stateCreditEntries = getStateCreditEntries(m, regionCode);

  const allEntriesForProgram = [...countryData(countryId).allVars, ...stateCreditEntries,
    ...ACCOUNTING_SERIES.map(variable => ({ variable })),
  ];
  const programData = {};
  for (const entry of allEntriesForProgram) {
    const v = entry.variable;
    programData[v] = {
      married: marriedData[v] || [],
      ...(cohabiting ? {
        unmarried: unmarriedData[v] || [],
      } : {
        head: headData[v] || [],
        spouse: spouseData[v] || [],
      }),
    };
  }

  // Build delta grids from the country's gridConfig
  function buildDeltaGrid(marriedFlat, headFlat, spouseFlat, unmarriedFlat) {
    const marriedGrid = [];
    for (let i = 0; i < count; i++) {
      marriedGrid.push(marriedFlat.slice(i * count, (i + 1) * count));
    }
    const deltaGrid = marriedGrid.map((row, i) =>
      row.map((val, j) => val - (cohabiting
        ? unmarriedFlat[i * count + j]
        : headFlat[i] + spouseFlat[j])),
    );
    const transposed = deltaGrid[0].map((_, col) =>
      deltaGrid.map((row) => row[col]),
    );
    return { grid: transposed, headLine: cohabiting ? undefined : headFlat, spouseLine: cohabiting ? undefined : spouseFlat };
  }

  const grids = {};
  const unmarriedGrids = {};
  const headLines = {};
  const spouseLines = {};

  for (const gc of country.gridConfig) {
    const { grid: transposed, headLine, spouseLine } = buildDeltaGrid(
      marriedData[gc.variable],
      headData[gc.variable],
      spouseData[gc.variable],
      unmarriedData[gc.variable],
    );
    headLines[gc.tab] = headLine;
    spouseLines[gc.tab] = spouseLine;
    grids[gc.tab] = gc.invertDelta
      ? transposed.map((row) => row.map((val) => -val))
      : transposed;
    if (cohabiting) {
      unmarriedGrids[gc.tab] = Array.from({ length: count }, (_, spouseIdx) =>
        Array.from({ length: count }, (_, headIdx) => unmarriedData[gc.variable][headIdx * count + spouseIdx]),
      );
    }
  }

  // US-only: Federal Credits = Total Credits - State Credits
  if (countryId === "us" && grids["refundable tax credits"] && grids["state credits"]) {
    const totalCreditsGrid = grids["refundable tax credits"];
    const stateCreditsGrid = grids["state credits"];
    grids["federal credits"] = totalCreditsGrid.map((row, i) =>
      row.map((val, j) => val - stateCreditsGrid[i][j]),
    );
    if (cohabiting) {
      unmarriedGrids["federal credits"] = unmarriedGrids["refundable tax credits"].map((row, i) =>
        row.map((val, j) => val - unmarriedGrids["state credits"][i][j]),
      );
    }
    headLines["federal credits"] = (headLines["refundable tax credits"] || []).map(
      (v, i) => v - (headLines["state credits"]?.[i] || 0),
    );
    spouseLines["federal credits"] = (spouseLines["refundable tax credits"] || []).map(
      (v, i) => v - (spouseLines["state credits"]?.[i] || 0),
    );
  }

  // Retain non-accounting assumptions for the selected-cell explanation.
  return { grids, maxIncome, count, programData, stateCreditEntries, headLines, spouseLines, unmarriedGrids, extras };
}

// Which programs actually drive the gap at one point on the heatmap.
//
// The headline number says a couple is £X better or worse off together. It
// does not say why, and "why" is the question a benefits analyst is actually
// asking: is this Universal Credit, is it child benefit, is it income tax or
// National Insurance. Returns the movers grouped into benefits and taxes,
// largest first within each group.
//
// Sign convention: positive always favours living together. Benefits are used
// as they are; taxes are flipped, so paying more tax together reads negative.
// Getting that backwards would tell the reader the opposite of the truth.
// `only` restricts the result to one category. The heatmap has a tab per
// variable, and a Taxes heatmap showing no change must not list a benefit as
// its driver: the number above the list is the tax delta, so the list has to
// explain that number and nothing else.
export function buildCellBreakdown(
  countryId, programData, headIdx, spouseIdx, count, limitPerGroup = 6, only = null,
) {
  const { m } = countryData(countryId);

  function valueAt(varName, scenario) {
    const arr = programData?.[varName]?.[scenario];
    if (!arr || arr.length === 0) return 0;
    if (scenario === "married" || scenario === "unmarried") return arr[headIdx * count + spouseIdx] || 0;
    if (scenario === "head") return arr[headIdx] || 0;
    if (scenario === "spouse") return arr[spouseIdx] || 0;
    return 0;
  }

  function rowsFor(entries, sign) {
    const rows = [];
    for (const entry of entries || []) {
      const together = valueAt(entry.variable, "married");
      const apart = programData?.[entry.variable]?.unmarried
        ? valueAt(entry.variable, "unmarried")
        : valueAt(entry.variable, "head") + valueAt(entry.variable, "spouse");
      const delta = sign * (together - apart);
      if (Math.round(delta) === 0) continue;
      rows.push({ label: entry.label, variable: entry.variable, delta });
    }
    rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return rows.slice(0, limitPerGroup);
  }

  const expenseEntries = countryId === "us" ? [
    { variable: "childcare_cost_deducted", label: "Childcare costs" },
    { variable: "household_health_costs", label: "Health costs" },
  ] : [{ variable: "rent_deducted", label: "Housing costs" }];
  const groups = [
    { key: "benefits", title: "Benefits", rows: rowsFor(m.benefits, 1) },
    { key: "credits", title: "Credits", rows: rowsFor(m.credits, 1) },
    { key: "taxes", title: "Taxes", rows: rowsFor(m.taxes, -1) },
    { key: "costs", title: "Costs", rows: rowsFor(expenseEntries, -1) },
  ];

  const wanted = only ? groups.filter((g) => g.key === only) : groups;
  return wanted.filter((g) => g.rows.length > 0);
}

export function buildCellResults(
  countryId, programData, headIdx, spouseIdx, count, stateCreditEntries, extras = {},
) {
  const { m, country: { aggregateMap } } = countryData(countryId);

  function getVal(varName, scenario) {
    const arr = programData[varName]?.[scenario];
    if (!arr || arr.length === 0) return 0;
    if (scenario === "married" || scenario === "unmarried") return arr[headIdx * count + spouseIdx] || 0;
    if (scenario === "head") return arr[headIdx] || 0;
    if (scenario === "spouse") return arr[spouseIdx] || 0;
    return 0;
  }

  function buildDict(metaEntries, scenario) {
    const d = {};
    for (const entry of metaEntries) d[entry.variable] = getVal(entry.variable, scenario);
    return d;
  }

  function buildStateCreditDict(scenario) {
    const d = {};
    if (m.stateCredits?.length) {
      d.state_refundable_credits = getVal("state_refundable_credits", scenario);
    }
    for (const entry of (stateCreditEntries || [])) {
      d[entry.label] = getVal(entry.variable, scenario);
    }
    return d;
  }

  function buildAggs(scenario) {
    const aggs = {};
    for (const [key, varName] of Object.entries(aggregateMap)) {
      aggs[key] = varName ? getVal(varName, scenario) : 0;
    }
    return aggs;
  }

  function buildResult(scenario) {
    const aggregates = buildAggs(scenario);
    if (countryId === "uk") aggregates.rentDeducted = getVal("rent_deducted", scenario);
    if (countryId === "us") aggregates.childcareCostDeducted = getVal("childcare_cost_deducted", scenario);
    return {
      aggregates,
      ...(countryId === "us" ? { childcare: childcareResult(variable => getVal(variable, scenario), extras) } : {}),
      benefits: buildDict(m.benefits, scenario),
      health: buildDict(m.healthcare || [], scenario),
      credits: buildDict(m.credits || [], scenario),
      stateCredits: buildStateCreditDict(scenario),
      taxes: buildDict(m.taxes, scenario),
      stateTaxes: buildDict(m.stateTaxes || [], scenario),
    };
  }

  return {
    married: buildResult("married"),
    ...(Object.values(programData).some(series => series.unmarried) ? {
      unmarried: buildResult("unmarried"),
    } : {
      headSingle: buildResult("head"),
      spouseSingle: buildResult("spouse"),
    }),
  };
}

function childcareResult(value, extras) {
  return {
    enabled: value("childcare_gross_cost") > 0,
    slotAvailable: extras.ccdfSlotAvailable !== false,
    grossCost: value("childcare_gross_cost"),
    subsidy: value("child_care_subsidies"),
    providerPayment: value("childcare_provider_payment"),
    familyShare: value("childcare_family_share"),
    outOfPocket: value("childcare_out_of_pocket"),
    headStartEligible: value("is_head_start_eligible"),
    earlyHeadStartEligible: value("is_early_head_start_eligible"),
    headStartValue: value("head_start_service_value"),
    earlyHeadStartValue: value("early_head_start_service_value"),
    includeHeadStart: false,
  };
}
