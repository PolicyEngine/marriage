import { getCountry } from "./countries";

const API_BASE = "https://api.policyengine.org";

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

function createUSSituation(regionCode, headIncome, disabilityStatus, spouseIncome, children, year, pregnancyStatus, headAge, spouseAge, esiStatus, inNYC) {
  const members = ["you"];
  const maritalUnitMembers = ["you"];

  const people = {
    you: {
      age: { [year]: headAge },
      employment_income: { [year]: headIncome },
      is_disabled: { [year]: disabilityStatus.head || false },
      is_pregnant: { [year]: pregnancyStatus.head || false },
      ...(esiStatus.head ? { has_esi: { [year]: true } } : {}),
    },
  };

  if (spouseIncome !== null) {
    people["your partner"] = {
      age: { [year]: spouseAge },
      employment_income: { [year]: spouseIncome },
      is_disabled: { [year]: disabilityStatus.spouse || false },
      is_pregnant: { [year]: pregnancyStatus.spouse || false },
      ...(esiStatus.spouse ? { has_esi: { [year]: true } } : {}),
    };
    members.push("your partner");
    maritalUnitMembers.push("your partner");
  }

  const maritalUnits = {
    "your marital unit": { members: [...maritalUnitMembers] },
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

  return {
    people,
    families: { "your family": { members: [...members] } },
    marital_units: maritalUnits,
    tax_units: { "your tax unit": { members: [...members] } },
    spm_units: { "your spm_unit": { members: [...members] } },
    households: {
      "your household": {
        members: [...members],
        state_name: { [year]: regionCode },
        ...(inNYC ? { in_nyc: { [year]: true } } : {}),
      },
    },
  };
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
  return createUSSituation(regionCode, headIncome, disabilityStatus, spouseIncome, children, year, pregnancyStatus, headAge, spouseAge, esiStatus, inNYC);
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
    const target = situation[container.key]?.[container.name];
    if (!target) continue;
    for (const v of vars) target[v] = { [year]: null };
  }

  for (const personName of Object.keys(situation.people)) {
    const person = situation.people[personName];
    for (const v of (detailByEntity.person || [])) {
      person[v] = { [year]: null };
    }
  }

  // US-only: per-state credit variables
  if (countryId === "us" && regionCode) {
    const tu = situation.tax_units["your tax unit"];
    for (const entry of getStateCreditEntries(m, regionCode)) {
      if (entry.entity === "person") {
        for (const person of Object.values(situation.people)) {
          person[entry.variable] = { [year]: null };
        }
      } else {
        tu[entry.variable] = { [year]: null };
      }
    }
  }

  return situation;
}

// ---------- API call ----------

async function callApi(countryId, situation) {
  const country = getCountry(countryId);
  const res = await fetch(`${API_BASE}${country.apiPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ household: situation }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  if (data.status === "error") {
    throw new Error(data.message || "Calculation error");
  }
  return data.result || data;
}

// ---------- extraction helpers ----------

function extractVal(result, entity, name, variable, year) {
  const val = result?.[entity]?.[name]?.[variable]?.[year];
  if (val == null) return 0;
  if (Array.isArray(val)) return val[0];
  return val;
}

function extractArray(result, entity, name, variable, year) {
  const val = result?.[entity]?.[name]?.[variable]?.[year];
  if (Array.isArray(val)) return val;
  return val != null ? [val] : [];
}

function sumPersonVar(result, variable, year) {
  const people = result?.people || {};
  let total = 0;
  for (const person of Object.values(people)) {
    const val = person?.[variable]?.[year];
    if (typeof val === "number") total += val;
    else if (Array.isArray(val)) total += val[0] || 0;
  }
  return total;
}

function sumPersonArray(result, variable, year) {
  const people = result?.people || {};
  let total = null;
  for (const person of Object.values(people)) {
    const val = person?.[variable]?.[year];
    if (Array.isArray(val)) {
      if (!total) total = new Array(val.length).fill(0);
      for (let i = 0; i < val.length; i++) total[i] += val[i] || 0;
    } else if (typeof val === "number") {
      if (!total) total = [val];
      else total[0] += val;
    }
  }
  return total || [];
}

// ---------- metadata-driven extraction (parameterized by country) ----------

function extractMetaVal(countryId, result, entry, year) {
  const { country } = countryData(countryId);
  const { variable, entity } = entry;
  if (entity === "person") return sumPersonVar(result, variable, year);
  const c = country.entityContainers[entity];
  if (!c) return 0;
  return extractVal(result, c.key, c.name, variable, year);
}

function extractMetaDict(countryId, result, entries, year) {
  const dict = {};
  for (const entry of entries) {
    dict[entry.variable] = extractMetaVal(countryId, result, entry, year);
  }
  return dict;
}

function extractMetaArray(countryId, result, entry, year) {
  const { country } = countryData(countryId);
  const { variable, entity } = entry;
  if (entity === "person") return sumPersonArray(result, variable, year);
  const c = country.entityContainers[entity];
  if (!c) return [];
  return extractArray(result, c.key, c.name, variable, year);
}

function extractAllArrays(countryId, result, year) {
  const { allVars } = countryData(countryId);
  const data = {};
  for (const entry of allVars) {
    data[entry.variable] = extractMetaArray(countryId, result, entry, year);
  }
  return data;
}

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

export function housingCostFor(extras = {}) {
  return isRentedTenure(extras.tenureType) ? extras.rent || 0 : 0;
}

export function deductRent(countryId, aggregates, extras = {}) {
  const country = getCountry(countryId);
  const rent = housingCostFor(extras);
  if (!country.deductRentFromNetIncome || !rent) return aggregates;
  return {
    ...aggregates,
    householdNetIncome: aggregates.householdNetIncome - rent,
    householdNetIncomeWithHealth: aggregates.householdNetIncomeWithHealth - rent,
    rentDeducted: rent,
  };
}

// ---------- aggregate extraction helper ----------

function extractAggregates(countryId, result, year) {
  const { country, m } = countryData(countryId);
  const am = country.aggregateMap;
  const aggs = {};
  for (const [key, varName] of Object.entries(am)) {
    if (!varName) {
      aggs[key] = 0;
      continue;
    }
    const entry = m.aggregates.find((a) => a.variable === varName);
    aggs[key] = entry ? extractMetaVal(countryId, result, entry, year) : 0;
  }
  return aggs;
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

  const result = await callApi(countryId, situation);

  // Per-state credits (US only)
  const stateCreditEntries = getStateCreditEntries(m, regionCode);
  const perStateDict = {};
  for (const entry of stateCreditEntries) {
    perStateDict[entry.label] = extractMetaVal(countryId, result, entry, year);
  }

  const aggregates = deductRent(countryId, extractAggregates(countryId, result, year), extras);

  return {
    aggregates,
    benefits: extractMetaDict(countryId, result, m.benefits, year),
    health: extractMetaDict(countryId, result, m.healthcare || [], year),
    credits: extractMetaDict(countryId, result, m.credits || [], year),
    stateCredits: m.stateCredits?.length
      ? {
          state_refundable_credits: extractMetaVal(countryId, result, m.stateCredits[0], year),
          ...perStateDict,
        }
      : {},
    taxes: extractMetaDict(countryId, result, m.taxes, year),
    stateTaxes: extractMetaDict(countryId, result, m.stateTaxes || [], year),
  };
}

export async function getCategorizedPrograms(
  countryId, regionCode, headIncome, spouseIncome, children,
  disabilityStatus, year, pregnancyStatus = {},
  headAge = 40, spouseAge = 40, esiStatus = {}, inNYC = false, extras = {},
) {
  const country = getCountry(countryId);
  const defAge = country.defaultAge;

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
    extras,
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

  const [marriedResult, headResult, spouseResult] = await Promise.all([
    callApi(countryId, marriedSituation),
    callApi(countryId, headSingleSituation),
    callApi(countryId, spouseSingleSituation),
  ]);

  // Extract all per-program arrays for click-to-detail
  const marriedData = extractAllArrays(countryId, marriedResult, year);
  const headData = extractAllArrays(countryId, headResult, year);
  const spouseData = extractAllArrays(countryId, spouseResult, year);

  const stateCreditEntries = getStateCreditEntries(m, regionCode);

  const allEntriesForProgram = [...countryData(countryId).allVars, ...stateCreditEntries];
  const programData = {};
  for (const entry of allEntriesForProgram) {
    const v = entry.variable;
    programData[v] = {
      married: marriedData[v] || extractMetaArray(countryId, marriedResult, entry, year),
      head: headData[v] || extractMetaArray(countryId, headResult, entry, year),
      spouse: spouseData[v] || extractMetaArray(countryId, spouseResult, entry, year),
    };
  }

  // Build delta grids from the country's gridConfig
  function buildDeltaGrid(marriedFlat, headFlat, spouseFlat) {
    const marriedGrid = [];
    for (let i = 0; i < count; i++) {
      marriedGrid.push(marriedFlat.slice(i * count, (i + 1) * count));
    }
    const deltaGrid = marriedGrid.map((row, i) =>
      row.map((val, j) => val - (headFlat[i] + spouseFlat[j])),
    );
    const transposed = deltaGrid[0].map((_, col) =>
      deltaGrid.map((row) => row[col]),
    );
    return { grid: transposed, headLine: headFlat, spouseLine: spouseFlat };
  }

  const grids = {};
  const headLines = {};
  const spouseLines = {};

  // Rent is not subtracted by household_net_income, so apply it here to each
  // scenario's series before differencing. Doing it per-scenario (rather than
  // adjusting the delta) also keeps the single-person lines after housing.
  const heatmapRent = country.deductRentFromNetIncome ? housingCostFor(extras) : 0;
  const afterHousing = (arr, gc) =>
    heatmapRent && gc.deductRent && arr ? arr.map((v) => v - heatmapRent) : arr;

  for (const gc of country.gridConfig) {
    const { grid: transposed, headLine, spouseLine } = buildDeltaGrid(
      afterHousing(marriedData[gc.variable], gc),
      afterHousing(headData[gc.variable], gc),
      afterHousing(spouseData[gc.variable], gc),
    );
    headLines[gc.tab] = headLine;
    spouseLines[gc.tab] = spouseLine;
    grids[gc.tab] = gc.invertDelta
      ? transposed.map((row) => row.map((val) => -val))
      : transposed;
  }

  // US-only: Federal Credits = Total Credits - State Credits
  if (countryId === "us" && grids["refundable tax credits"] && grids["state credits"]) {
    const totalCreditsGrid = grids["refundable tax credits"];
    const stateCreditsGrid = grids["state credits"];
    grids["federal credits"] = totalCreditsGrid.map((row, i) =>
      row.map((val, j) => val - stateCreditsGrid[i][j]),
    );
    headLines["federal credits"] = (headLines["refundable tax credits"] || []).map(
      (v, i) => v - (headLines["state credits"]?.[i] || 0),
    );
    spouseLines["federal credits"] = (spouseLines["refundable tax credits"] || []).map(
      (v, i) => v - (spouseLines["state credits"]?.[i] || 0),
    );
  }

  return { grids, maxIncome, count, programData, stateCreditEntries, headLines, spouseLines };
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
export function buildCellBreakdown(
  countryId, programData, headIdx, spouseIdx, count, limitPerGroup = 6,
) {
  const { m } = countryData(countryId);

  function valueAt(varName, scenario) {
    const arr = programData?.[varName]?.[scenario];
    if (!arr || arr.length === 0) return 0;
    if (scenario === "married") return arr[headIdx * count + spouseIdx] || 0;
    if (scenario === "head") return arr[headIdx] || 0;
    if (scenario === "spouse") return arr[spouseIdx] || 0;
    return 0;
  }

  function rowsFor(entries, sign) {
    const rows = [];
    for (const entry of entries || []) {
      const together = valueAt(entry.variable, "married");
      const apart =
        valueAt(entry.variable, "head") + valueAt(entry.variable, "spouse");
      const delta = sign * (together - apart);
      if (Math.round(delta) === 0) continue;
      rows.push({ label: entry.label, variable: entry.variable, delta });
    }
    rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return rows.slice(0, limitPerGroup);
  }

  const groups = [
    { key: "benefits", title: "Benefits", rows: rowsFor(m.benefits, 1) },
    { key: "credits", title: "Credits", rows: rowsFor(m.credits, 1) },
    { key: "taxes", title: "Taxes", rows: rowsFor(m.taxes, -1) },
  ];

  return groups.filter((g) => g.rows.length > 0);
}

export function buildCellResults(countryId, programData, headIdx, spouseIdx, count, stateCreditEntries) {
  const { m, country: { aggregateMap } } = countryData(countryId);

  function getVal(varName, scenario) {
    const arr = programData[varName]?.[scenario];
    if (!arr || arr.length === 0) return 0;
    if (scenario === "married") return arr[headIdx * count + spouseIdx] || 0;
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
    return {
      aggregates: buildAggs(scenario),
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
    headSingle: buildResult("head"),
    spouseSingle: buildResult("spouse"),
  };
}
