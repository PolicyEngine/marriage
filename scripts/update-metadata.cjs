/**
 * Build-time script: fetches PolicyEngine US metadata and resolves
 * entity/label info for the variables we need.
 *
 * We use the API's `adds` tree to discover first-level children of each
 * aggregate, then write a compact src/metadata.json.
 *
 * Usage:  node scripts/update-metadata.cjs
 */

const fs = require("fs");
const path = require("path");

const API_URL = process.env.US_METADATA_URL;
const OUT_PATH = path.join(__dirname, "..", "lib", "metadata.json");

// Year used to resolve parameter-backed "adds" references
const YEAR = "2026";

// ---------- helpers ----------

/**
 * Resolve a parameter's date-keyed `values` to the list applicable for `year`.
 * e.g. { "2024-01-01": ["snap","tanf",...], "2022-01-01": [...] }
 * Returns the array for the latest date <= year.
 */
function resolveParameterValues(param, year) {
  if (!param || !param.values) return [];
  const yearInt = parseInt(year);
  const dates = Object.keys(param.values).sort();
  let applicable = null;
  for (const d of dates) {
    if (parseInt(d.split("-")[0]) <= yearInt) applicable = param.values[d];
  }
  return Array.isArray(applicable) ? applicable : [];
}

/**
 * Get the direct (first-level) children of a variable from its `adds`.
 */
function getDirectChildren(variableName, variables, parameters, year) {
  const variable = variables[variableName];
  if (!variable) return [];
  // Formula-based aggregates still publish the underlying list parameter.
  const adds = variable.adds || (parameters[`gov.household.${variableName}`]
    ? `gov.household.${variableName}` : null);
  if (!adds) return [];
  if (Array.isArray(adds)) return adds;
  if (typeof adds === "string") {
    const param = parameters[adds];
    if (!param) return [];
    return resolveParameterValues(param, year);
  }
  return [];
}

/**
 * Look up a variable's entity and label from metadata.
 */
function varInfo(varName, variables) {
  const v = variables[varName];
  return {
    variable: varName,
    entity: v ? v.entity : "unknown",
    label: v ? (v.label || varName) : varName,
  };
}

// ---------- main ----------

async function main() {
  // Production builds use the reviewed, committed metadata matching our pinned
  // runtime. An explicit source is required to update it; the public v1 API
  // runs a different model and must not overwrite this catalog during a build.
  if (!process.env.US_METADATA_FILE && !API_URL) {
    console.log("Using committed US metadata for the pinned marriage runtime.");
    return;
  }
  const data = process.env.US_METADATA_FILE
    ? JSON.parse(fs.readFileSync(process.env.US_METADATA_FILE, "utf8"))
    : await (async () => {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      return res.json();
    })();
  const { variables, parameters } = data.result || data;
  console.log(`  ${Object.keys(variables).length} variables, ${Object.keys(parameters).length} parameters`);

  // ---- Discover first-level children for each aggregate ----

  const benefitChildren = getDirectChildren("household_benefits", variables, parameters, YEAR);
  console.log(`\nhousehold_benefits first-level children (${benefitChildren.length}):`);
  for (const c of benefitChildren) console.log(`  ${c} (${variables[c]?.entity})`);

  const creditChildren = getDirectChildren("income_tax_refundable_credits", variables, parameters, YEAR);
  console.log(`\nincome_tax_refundable_credits first-level children (${creditChildren.length}):`);
  for (const c of creditChildren) console.log(`  ${c} (${variables[c]?.entity})`);

  const taxChildren = getDirectChildren("household_tax_before_refundable_credits", variables, parameters, YEAR);
  console.log(`\nhousehold_tax_before_refundable_credits first-level children (${taxChildren.length}):`);
  for (const c of taxChildren) console.log(`  ${c} (${variables[c]?.entity})`);

  const healthChildren = getDirectChildren("healthcare_benefit_value", variables, parameters, YEAR);
  console.log(`\nhealthcare_benefit_value first-level children (${healthChildren.length}):`);
  for (const c of healthChildren) console.log(`  ${c} (${variables[c]?.entity})`);

  // ---- Build metadata using first-level children ----
  // Skip household_health_benefits from benefits (overlap with healthcare tab)
  const skipBenefits = new Set(["household_health_benefits"]);

  const benefits = [...new Set(benefitChildren
    .filter(v => !skipBenefits.has(v))
    .flatMap(v => v === "household_head_start_benefits" ? ["head_start", "early_head_start"] : [v])
    .concat("child_care_subsidies"))]
    .map(v => varInfo(v, variables));

  const credits = creditChildren.map(v => varInfo(v, variables));

  // For taxes, keep first-level children (which includes the aggregate
  // household_state_tax_before_refundable_credits instead of 48 state vars)
  const taxes = taxChildren.map(v => varInfo(v, variables));

  const healthcare = healthChildren.map(v => varInfo(v, variables));

  // Discover per-state credit leaf variables so we can show exact credit
  // names instead of an "Other State Credits" bucket.
  const stateAggChildren = getDirectChildren("state_refundable_credits", variables, parameters, YEAR);
  const stateCreditsByState = {};
  for (const stateAgg of stateAggChildren) {
    // stateAgg is like "ca_refundable_credits" — extract state code
    const match = stateAgg.match(/^([a-z]{2,3})_refundable_credits$/);
    if (!match) continue;
    const code = match[1].toUpperCase();
    const leafCredits = getDirectChildren(stateAgg, variables, parameters, YEAR);
    if (leafCredits.length > 0) {
      stateCreditsByState[code] = leafCredits.map(v => varInfo(v, variables));
    }
  }
  console.log(`\nState credit leaf variables discovered for ${Object.keys(stateCreditsByState).length} states`);
  for (const [code, creds] of Object.entries(stateCreditsByState)) {
    console.log(`  ${code}: ${creds.map(c => c.variable).join(", ")}`);
  }

  const metadata = {
    modelVersion: (data.result || data).model_version || (data.result || data).version,
    benefits,
    credits,
    taxes,
    healthcare,
    stateCredits: [
      varInfo("state_refundable_credits", variables),
    ],
    stateCreditsByState,
    stateTaxes: [
      varInfo("state_income_tax_before_refundable_credits", variables),
    ],
    aggregates: [
      varInfo("household_net_income", variables),
      varInfo("household_net_income_including_health_benefits", variables),
      varInfo("household_benefits", variables),
      varInfo("household_refundable_tax_credits", variables),
      varInfo("household_tax_before_refundable_credits", variables),
      varInfo("healthcare_benefit_value", variables),
      varInfo("household_refundable_state_tax_credits", variables),
    ],
  };

  // ---- Log final output ----
  for (const cat of ["benefits", "credits", "taxes", "healthcare", "stateCredits", "stateTaxes"]) {
    console.log(`\n  ${cat}:`);
    for (const v of metadata[cat]) {
      console.log(`    ${v.variable} (${v.entity}) - ${v.label}`);
    }
  }

  // The API's `adds` tree is the only source for these lists, and when a
  // variable's `adds` is null upstream the discovery above silently yields an
  // empty list. Writing that out replaces a working breakdown with nothing,
  // and because this runs on `prebuild` it lands in a commit without anyone
  // choosing it. That is exactly how the 18 US benefit entries were lost.
  //
  // Never let a regeneration empty a category that currently has entries.
  const existing = fs.existsSync(OUT_PATH)
    ? JSON.parse(fs.readFileSync(OUT_PATH, "utf8"))
    : {};
  const emptied = [];
  for (const cat of ["benefits", "credits", "taxes", "healthcare", "stateCredits", "stateTaxes"]) {
    const found = metadata[cat] || [];
    const kept = existing[cat] || [];
    if (found.length === 0 && kept.length > 0) {
      metadata[cat] = kept;
      emptied.push(cat);
    }
  }

  if (emptied.length > 0) {
    console.warn(
      `\nWARNING: discovery returned nothing for ${emptied.join(", ")}. ` +
      "Kept the existing entries rather than writing an empty list. " +
      "Check whether the upstream `adds` tree changed shape.",
    );
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(metadata, null, 2) + "\n");
  const childcarePath = path.join(__dirname, "..", "lib", "childcare-metadata.json");
  const childcare = JSON.parse(fs.readFileSync(childcarePath, "utf8"));
  const programs = getDirectChildren("child_care_subsidies", variables, parameters, YEAR);
  const stateBenefits = getDirectChildren("household_state_benefits", variables, parameters, YEAR);
  // Provider variable routing is curated; refresh its enums and every county
  // from the same model. Fail rather than silently drop a state's input fields.
  for (const [code, state] of Object.entries(childcare.states)) {
    if (!programs.includes(state.program)) throw new Error(`Missing childcare program for ${code}`);
    state.period = variables[state.program].definitionPeriod;
    state.includedInStateBenefits = stateBenefits.includes(state.program);
    for (const field of state.providers) {
      const variable = variables[field.variable];
      if (!variable?.possibleValues?.length) throw new Error(`Missing provider enum ${field.variable}`);
      field.options = variable.possibleValues;
      field.defaultValue = variable.defaultValue;
      field.entity = variable.entity;
      field.period = variable.definitionPeriod;
    }
  }
  childcare.counties = {};
  for (const county of variables.county.possibleValues) {
    const code = county.value.slice(-2);
    if (childcare.states[code]) (childcare.counties[code] ||= []).push(county);
  }
  childcare.modelVersion = metadata.modelVersion;
  childcare.source = `https://pypi.org/project/policyengine-us/${metadata.modelVersion}/`;
  fs.writeFileSync(childcarePath, JSON.stringify(childcare, null, 2) + "\n");
  console.log(`\nWrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
