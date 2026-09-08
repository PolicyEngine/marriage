import React, { useState, useEffect, useMemo, Suspense, lazy } from "react";
import { computeTableData, unmarriedTotal, PROGRAM_DESCRIPTIONS, formatCurrency, resourceValues } from "@/lib/utils";
import { buildCellResults, buildCellBreakdown } from "@/lib/api";
import MetricCards from "./MetricCards";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@policyengine/ui-kit/primitives";

const Heatmap = lazy(() => import("./Heatmap"));

// Tab definitions — filtered by country.tabs at render time
const ALL_TABS = {
  summary: { key: "summary", label: "Summary", heatmapKey: "net income" },
  taxes: { key: "taxes", label: "Taxes", heatmapKey: "tax before refundable credits" },
  benefits: { key: "benefits", label: "Benefits", heatmapKey: "benefits" },
  credits: { key: "credits", label: "Credits", heatmapKey: "refundable tax credits" },
};

// UK override for heatmap keys (different variable names produce different grid labels)
const UK_HEATMAP_OVERRIDES = {
  taxes: "tax",
};

function DataTable({ rows, emptyMessage, unmarriedLabel = "Not married", countryId, regionLabel = "Tax and benefit comparison" }) {
  if (rows.length === 0) {
    return <p className="loading">{emptyMessage || "No data to display."}</p>;
  }

  const showIndividual = rows.some((r) => r.headSingle !== null);

  function deltaClass(col, row) {
    if (!col.colored) return "";
    if (row.rawDelta > 0) return "positive";
    if (row.rawDelta < 0) return "negative";
    return "";
  }

  const scenarioCols = [
    ...(showIndividual ? [
      { label: countryId === "us" ? "You (unmarried)" : "You (single)", key: "headSingle" },
      { label: countryId === "us" ? "Partner (unmarried)" : "Partner (single)", key: "spouseSingle" },
    ] : []),
    { label: unmarriedLabel, key: "notMarried" },
    { label: "Married", key: "married" },
    { label: "Delta", key: "delta", colored: true },
    { label: "Delta %", key: "deltaPct", colored: true },
  ];

  return (
    <TooltipProvider>
    <div className="table-scroll" tabIndex={0} role="region" aria-label={regionLabel}>
      <table className="data-table">
        <thead>
          <tr>
            <th></th>
            {scenarioCols.map((col) => (
              <th key={col.label}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={row.isTotal ? "total-row" : ""}>
              <td className="row-label">
                {PROGRAM_DESCRIPTIONS[row.program] ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="program-name-tip" tabIndex={0}>{row.program}</span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="start" className="max-w-80 whitespace-normal">
                      {PROGRAM_DESCRIPTIONS[row.program]}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  row.program
                )}
              </td>
              {scenarioCols.map((col) => (
                <td
                  key={col.label}
                  className={deltaClass(col, row)}
                >
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </TooltipProvider>
  );
}

export default function ResultsDisplay({
  results,
  heatmapData,
  heatmapLoading,
  heatmapError,
  onRetryHeatmap,
  headIncome,
  spouseIncome,
  valentine,
  onCellClick: onCellClickProp,
  esiStatus,
  country,
  livingArrangement,
  hasChildren = false,
}) {
  const showHealth = country.id !== "us" && !esiStatus?.head && !esiStatus?.spouse;
  const [activeTab, setActiveTab] = useState("summary");
  const [viewMode, setViewMode] = useState("table");
  const [cellSelection, setCellSelection] = useState(null);

  const countryId = country.id;
  const sym = country.currencySymbol;
  const cohabiting = Boolean(results.unmarried);
  const unmarriedLabel = countryId === "us"
    ? `Unmarried, ${cohabiting ? "living together" : "living separately"}`
    : "Not married";

  // Filter tabs based on country config
  const visibleTabs = useMemo(
    () => country.tabs.map((key) => ALL_TABS[key]).filter(Boolean),
    [country.tabs],
  );

  // Reset to summary if active tab isn't available for this country
  useEffect(() => {
    if (!country.tabs.includes(activeTab)) setActiveTab("summary");
  }, [country.tabs, activeTab]);

  // Build virtual results from clicked heatmap cell
  const cellResults = useMemo(() => {
    if (!cellSelection || !heatmapData?.programData) return null;
    return buildCellResults(
      countryId,
      heatmapData.programData,
      cellSelection.headIdx,
      cellSelection.spouseIdx,
      heatmapData.count || 33,
      heatmapData.stateCreditEntries,
      heatmapData.extras || {},
    );
  }, [cellSelection, heatmapData, countryId]);

  const activeResults = cellResults || results;

  const currentTab = visibleTabs.find((t) => t.key === activeTab) || visibleTabs[0];
  const rows = computeTableData(activeResults, activeTab, { showHealth, currencySymbol: sym, countryId });

  const EMPTY_MESSAGES = {
    summary: "No data available for this scenario.",
    taxes: "No tax liability at these income levels.",
    benefits: "Not eligible for benefit programs at these income levels.",
    credits: "No refundable credits at these income levels.",
  };

  // Resolve heatmap key — use UK overrides if applicable
  const heatmapKey = UK_HEATMAP_OVERRIDES[activeTab] && countryId === "uk"
    ? UK_HEATMAP_OVERRIDES[activeTab]
    : currentTab.heatmapKey;
  const heatmapGrid = heatmapData?.grids?.[heatmapKey] || null;
  const combinedHeadLine = heatmapData?.headLines?.[heatmapKey];
  const combinedSpouseLine = heatmapData?.spouseLines?.[heatmapKey];
  const unmarriedGrid = heatmapData?.unmarriedGrids?.[heatmapKey];

  const HEATMAP_AGG = {
    "net income": "householdNetIncome",
    "net income (with healthcare)": "householdNetIncomeWithHealth",
    "benefits": "householdBenefits",
    "tax before refundable credits": "householdTaxBeforeCredits",
    "tax": "householdTaxBeforeCredits",
    "refundable tax credits": "householdRefundableCredits",
  };
  const aggKey = HEATMAP_AGG[heatmapKey];
  let markerDelta = null;
  if (aggKey) {
    const m = activeResults.married.aggregates[aggKey] || 0;
    markerDelta = m - unmarriedTotal(activeResults, "aggregates", aggKey);
    if (heatmapKey === "tax before refundable credits" || heatmapKey === "tax") {
      markerDelta = -markerDelta;
    }
  }

  function handleCellClick(headIdx, spouseIdx) {
    setCellSelection({ headIdx, spouseIdx });
    if (onCellClickProp && heatmapData) {
      const step = heatmapData.maxIncome / (heatmapData.count - 1);
      onCellClickProp(Math.round(headIdx * step), Math.round(spouseIdx * step));
    }
  }

  const heatmapLabel = countryId === "us" && activeTab === "summary"
    ? "household financial resources" : heatmapKey;

  // Check if the active heatmap key corresponds to an inverted variable (e.g. taxes)
  const heatmapInvertDelta = country.gridConfig?.some(
    (gc) => gc.tab === heatmapKey && gc.invertDelta,
  ) || false;

  // Feeds the heatmap hover: which programs move at the cell under the cursor.
  // On a single-category heatmap the number in the hover is that category's
  // delta, so the drivers listed under it must come from the same category.
  // The summary heatmap is net income, where every category contributes.
  const BREAKDOWN_CATEGORY = {
    taxes: "taxes",
    benefits: "benefits",
    credits: "credits",
  };

  function getCellBreakdown(headIdx, spouseIdx) {
    if (!heatmapData?.programData) return null;
    return buildCellBreakdown(
      countryId,
      heatmapData.programData,
      headIdx,
      spouseIdx,
      heatmapData.count,
      6,
      BREAKDOWN_CATEGORY[activeTab] || null,
    );
  }

  const heatmapProps = heatmapGrid ? {
    grid: heatmapGrid,
    headIncome,
    spouseIncome,
    valentine,
    maxIncome: heatmapData?.maxIncome || 80000,
    count: heatmapData?.count || 33,
    markerDelta,
    onCellClick: heatmapData?.programData ? handleCellClick : undefined,
    getBreakdown: heatmapData?.programData ? getCellBreakdown : undefined,
    selectedCell: cellSelection,
    label: heatmapLabel,
    headLine: combinedHeadLine,
    spouseLine: combinedSpouseLine,
    unmarriedGrid,
    unmarriedLabel,
    currencySymbol: sym,
    invertDelta: heatmapInvertDelta,
  } : null;

  const heatmapContent = heatmapLoading ? (
    <p className="loading">
      <span className="spinner" />
      Loading heatmap...
    </p>
  ) : heatmapError ? (
    <div className="heatmap-recovery" role="alert">
      <p>{heatmapError}</p>
      <p>Your calculated household results are still available in the table.</p>
      {onRetryHeatmap && <button className="share-btn" onClick={onRetryHeatmap}>Retry heatmap</button>}
    </div>
  ) : heatmapProps ? (
    <Suspense
      fallback={
        <p className="loading">
          <span className="spinner" />
          Loading chart...
        </p>
      }
    >
      <Heatmap {...heatmapProps} />
    </Suspense>
  ) : null;

  return (
    <div className="results">
      {countryId === "us" && (
        <h2 className="comparison-heading">{cohabiting ? "Effect of marriage" : "Effect of marrying and combining households"}</h2>
      )}
      <MetricCards
        results={activeResults}
        showHealth={showHealth}
        currencySymbol={sym}
        countryId={countryId}
        livingArrangement={livingArrangement || (cohabiting ? "cohabiting" : "separate")}
      />
      {countryId === "us" && <ServiceValueComparison results={activeResults} unmarriedLabel={unmarriedLabel} />}
      <nav className="tab-bar" aria-label="Result categories">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            className={`tab-btn ${activeTab === tab.key ? "active" : ""}`}
            aria-pressed={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
        <div className="view-toggle">
          {["table", "grid"].map((mode) => (
            <button
              key={mode}
              className={`view-toggle-btn ${viewMode === mode ? "active" : ""}`}
              aria-pressed={viewMode === mode}
              onClick={() => setViewMode(mode)}
            >
              {mode === "table" ? "Table" : "Grid"}
            </button>
          ))}
        </div>
      </nav>

      <div className="tab-content-single">
        {viewMode === "table" && (
          <div className="single-table">
            <DataTable rows={rows} emptyMessage={EMPTY_MESSAGES[activeTab]} unmarriedLabel={unmarriedLabel} countryId={countryId} />
          </div>
        )}

        {viewMode === "grid" && heatmapContent && (
          <div className="single-heatmap">
            {heatmapContent}
          </div>
        )}
        {viewMode === "table" && heatmapError && !heatmapLoading && heatmapContent}
      </div>
      {countryId === "us" && activeResults.married.childcare && (hasChildren || activeResults.married.childcare.earlyHeadStartEligible > 0 || unmarriedTotal(activeResults, "childcare", "earlyHeadStartEligible") > 0) && (
        <section className="px-5 py-4 border-t border-border" aria-label="Childcare and early education">
          <h3 className="text-base font-semibold text-foreground mb-2">Childcare and early education</h3>
          <EarlyEducationTable results={activeResults} unmarriedLabel={unmarriedLabel} />
          <p className="text-sm text-muted-foreground mt-3">
            Eligibility estimates do not guarantee an available place. Head Start service values use state spending per enrollee. They are shown separately from financial resources and included in combined resources.
            {activeResults.married.childcare.enabled && " Benefits include the reduction in family childcare spending once. Care charges, including required family contributions, are deducted once from income. State payments to providers are shown separately because they can exceed the family's price. Paid care excludes free Head Start hours. Vermont estimates assume providers collect the modeled family share."}
          </p>
        </section>
      )}
      {countryId === "us" && (
        <p className="comparison-assumptions" role="note" aria-label="Comparison assumptions">
          {cohabiting
            ? "The unmarried couple shares a home, food, and resources. SNAP and other modeled household benefits use the same shared resource unit before and after marriage."
            : "The unmarried adults live in separate homes. These results include changes from combining households as well as marriage. Housing costs and savings from sharing a home are not modeled."}
          {hasChildren && (cohabiting
            ? " Children are assumed to be both adults' children; the adult labeled You claims them and pays more than half the cost of keeping up the home."
            : " All children are assumed to be both adults' children and live with the adult labeled You.")}
          {cohabiting && hasChildren && " Medicaid estimates use simplified parent/caretaker rules and may misstate eligibility for unmarried parents living together."}
          {" US calculations use PolicyEngine US " + country.metadata.modelVersion + "."}
        </p>
      )}
    </div>
  );
}

function ServiceValueComparison({ results, unmarriedLabel }) {
  const [showHealthcare, setShowHealthcare] = useState(false);
  const married = resourceValues(results.married);
  const singles = (results.unmarried ? [results.unmarried] : [results.headSingle, results.spouseSingle]).map(resourceValues);
  const rows = [
    ["Healthcare service value", "healthcareBenefitValue"],
    ["Early education service value", "earlyEducationServiceValue"],
    ["Combined resources", "combinedResources"],
  ];
  const healthcareRows = computeTableData(results, "healthcare", { countryId: "us" });
  return <section className="service-comparison" aria-label="Service values and combined resources">
    <h3>Service values and combined resources</h3>
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Resource comparison">
      <table className="data-table resource-table">
        <thead><tr><th></th><th>{unmarriedLabel}</th><th>Married</th><th>Change</th></tr></thead>
        <tbody>{rows.map(([label, key]) => {
          const unmarried = singles.reduce((sum, value) => sum + value[key], 0);
          return <tr key={key} className={key === "combinedResources" ? "total-row" : ""}>
            <th scope="row" className="row-label">{label}</th>
            <td>{formatCurrency(unmarried)}</td>
            <td>{formatCurrency(married[key])}</td>
            <td>{formatCurrency(married[key] - unmarried, true)}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <p className="resource-note">Combined resources add estimated healthcare and early education service values to financial resources. Service values do not represent additional spendable income.</p>
    <details className="service-details" onToggle={event => setShowHealthcare(event.currentTarget.open)}>
      <summary>Healthcare benefit details</summary>
      {showHealthcare && <DataTable rows={healthcareRows} unmarriedLabel={unmarriedLabel} countryId="us" regionLabel="Healthcare benefit comparison" />}
    </details>
  </section>;
}

function EarlyEducationTable({ results, unmarriedLabel }) {
  const married = results.married.childcare;
  const singles = results.unmarried ? [results.unmarried.childcare]
    : [results.headSingle.childcare, results.spouseSingle.childcare];
  const labels = [
    ...(married.enabled ? [
      ["Gross childcare costs", "grossCost", true],
      ["Childcare assistance (CCDF)", "subsidy", true],
      ["State payment to childcare provider", "providerPayment", true],
      ...(married.familyShare > 0 || singles.some(result => result?.familyShare > 0)
        ? [["Required family share", "familyShare", true]] : []),
      ["Out-of-pocket childcare costs", "outOfPocket", true],
    ] : []),
    ["Children eligible for Head Start", "headStartEligible", false],
    ["People eligible for Early Head Start", "earlyHeadStartEligible", false],
    ["Head Start (service value)", "headStartValue", true],
    ["Early Head Start (service value)", "earlyHeadStartValue", true],
  ];
  return <div className="table-scroll" tabIndex={0} role="region" aria-label="Childcare comparison">
    <table className="data-table">
      <thead><tr><th></th><th>{unmarriedLabel}</th><th>Married</th></tr></thead>
      <tbody>{labels.map(([label, key, money]) => {
        const unmarried = singles.reduce((sum, result) => sum + (result?.[key] || 0), 0);
        const format = value => money ? formatCurrency(value) : String(value);
        return <tr key={key}><td className="row-label">{label}</td><td>{format(unmarried)}</td><td>{format(married[key] || 0)}</td></tr>;
      })}</tbody>
    </table>
  </div>;
}
