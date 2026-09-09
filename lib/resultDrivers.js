import { computeTableData } from "./utils";

const SUMMARY_DRIVER_KINDS = {
  "Market income": "income",
  Earnings: "income",
  "Healthcare costs": "costs",
  "Childcare costs": "costs",
  "Housing costs": "costs",
};

function description(kind, effect) {
  const increasesResources = effect > 0;
  if (kind === "taxes") return increasesResources ? "Lower taxes" : "Higher taxes";
  if (kind === "costs") return increasesResources ? "Lower costs" : "Higher costs";
  if (kind === "credits") return increasesResources ? "More refundable credits" : "Fewer refundable credits";
  if (kind === "benefits") return increasesResources ? "More benefit income" : "Less benefit income";
  return increasesResources ? "More income" : "Less income";
}

// Reuse the table's program breakdown and residual rows so neither aggregate
// totals nor state-credit aggregates are counted alongside their components.
// rawDelta expresses the effect on resources: higher taxes/costs are negative.
export function financialChangeDrivers(results, countryId, limit = 3) {
  const options = { countryId, showHealth: false };
  const drivers = ["benefits", "credits", "taxes"].flatMap(kind =>
    computeTableData(results, kind, {
      ...options,
      // Financial benefits exclude services in both countries. UK currently
      // has no separate healthcare series; using this branch keeps it explicit.
      ...(kind === "benefits" ? { countryId: "us" } : {}),
    })
      .filter(row => !row.isTotal)
      .map(row => ({ ...row, kind })),
  );

  for (const row of computeTableData(results, "summary", options)) {
    const kind = SUMMARY_DRIVER_KINDS[row.program];
    if (kind) drivers.push({ ...row, kind });
  }

  return drivers
    .filter(row => Number.isFinite(row.rawDelta) && Math.round(row.rawDelta) !== 0)
    .sort((a, b) => Math.abs(b.rawDelta) - Math.abs(a.rawDelta))
    .slice(0, limit)
    .map(row => ({
      key: `${row.kind}:${row.program}`,
      label: row.program,
      effect: row.rawDelta,
      description: description(row.kind, row.rawDelta),
    }));
}
