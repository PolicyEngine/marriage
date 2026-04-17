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

const API_URL = "https://api.policyengine.org/us/metadata";
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
  const adds = variable.adds;
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
  console.log("Fetching PolicyEngine US metadata...");
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`API returned ${res.status}`);

  const data = await res.json();
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

  const benefits = benefitChildren
    .filter(v => !skipBenefits.has(v))
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

  fs.writeFileSync(OUT_PATH, JSON.stringify(metadata, null, 2) + "\n");
  console.log(`\nWrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
