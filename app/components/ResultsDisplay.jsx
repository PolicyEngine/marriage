import React, { useState, useEffect, useMemo, Suspense, lazy } from "react";
import { computeTableData, unmarriedTotal, PROGRAM_DESCRIPTIONS } from "@/lib/utils";
import { buildCellResults, buildCellBreakdown } from "@/lib/api";
import MetricCards from "./MetricCards";

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

function DataTable({ rows, emptyMessage, unmarriedLabel = "Not married", countryId }) {
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
    <div className="table-scroll">
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
                  <span className="program-name-tip">
                    {row.program}
                    <span className="tooltip">
                      {PROGRAM_DESCRIPTIONS[row.program]}
                    </span>
                  </span>
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
  );
}

export default function ResultsDisplay({
  results,
  heatmapData,
  heatmapLoading,
  headIncome,
  spouseIncome,
  valentine,
  onCellClick: onCellClickProp,
  esiStatus,
  country,
  livingArrangement,
  hasChildren = false,
}) {
  const showHealth = !esiStatus?.head && !esiStatus?.spouse;
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
  const rows = computeTableData(activeResults, activeTab, { showHealth, currencySymbol: sym });

  const EMPTY_MESSAGES = {
    summary: "No data available for this scenario.",
    taxes: "No tax liability at these income levels.",
    benefits: "Not eligible for benefit programs at these income levels.",
    credits: "No refundable credits at these income levels.",
  };

  // Resolve heatmap key — use UK overrides if applicable
  let heatmapKey = UK_HEATMAP_OVERRIDES[activeTab] && countryId === "uk"
    ? UK_HEATMAP_OVERRIDES[activeTab]
    : currentTab.heatmapKey;
  if (showHealth && activeTab === "summary" && countryId === "us") {
    heatmapKey = "net income (with healthcare)";
  }

  // For benefits tab with healthcare, combine grids element-wise
  let heatmapGrid = heatmapData?.grids?.[heatmapKey] || null;
  let combinedHeadLine = heatmapData?.headLines?.[heatmapKey];
  let combinedSpouseLine = heatmapData?.spouseLines?.[heatmapKey];
  let unmarriedGrid = heatmapData?.unmarriedGrids?.[heatmapKey];

  if (showHealth && activeTab === "benefits" && heatmapData?.grids && countryId === "us") {
    const benefitsGrid = heatmapData.grids["benefits"];
    const healthGrid = heatmapData.grids["healthcare benefits"];
    if (benefitsGrid && healthGrid) {
      heatmapGrid = benefitsGrid.map((row, i) =>
        row.map((val, j) => val + (healthGrid[i]?.[j] || 0)),
      );
    }
    const bHead = heatmapData.headLines?.["benefits"];
    const hHead = heatmapData.headLines?.["healthcare benefits"];
    if (bHead && hHead) combinedHeadLine = bHead.map((v, i) => v + (hHead[i] || 0));
    const bSpouse = heatmapData.spouseLines?.["benefits"];
    const hSpouse = heatmapData.spouseLines?.["healthcare benefits"];
    if (bSpouse && hSpouse) combinedSpouseLine = bSpouse.map((v, i) => v + (hSpouse[i] || 0));
    const bUnmarried = heatmapData.unmarriedGrids?.["benefits"];
    const hUnmarried = heatmapData.unmarriedGrids?.["healthcare benefits"];
    if (bUnmarried && hUnmarried) {
      unmarriedGrid = bUnmarried.map((row, i) => row.map((v, j) => v + (hUnmarried[i]?.[j] || 0)));
    }
  }

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
  if (activeTab === "benefits" && showHealth && countryId === "us") {
    const m = (activeResults.married.aggregates.householdBenefits || 0) + (activeResults.married.aggregates.healthcareBenefitValue || 0);
    const unmarried = unmarriedTotal(activeResults, "aggregates", "householdBenefits")
      + unmarriedTotal(activeResults, "aggregates", "healthcareBenefitValue");
    markerDelta = m - unmarried;
  } else if (aggKey) {
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

  let heatmapLabel = heatmapKey;
  if (heatmapKey === "net income (with healthcare)") heatmapLabel = "net income";
  if (showHealth && activeTab === "benefits" && countryId === "us") heatmapLabel = "benefits";

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
      </div>
      {countryId === "us" && (
        <p className="comparison-assumptions" role="note" aria-label="Comparison assumptions">
          {cohabiting
            ? "The unmarried couple shares a home, food, and resources. SNAP and other modeled household benefits use the same shared resource unit before and after marriage."
            : "The unmarried adults live in separate homes. These results include changes from combining households as well as marriage. Housing costs and savings from sharing a home are not modeled."}
          {hasChildren && (cohabiting
            ? " Children are assumed to be both adults' children; the adult labeled You claims them and pays more than half the cost of keeping up the home."
            : " All children are assumed to be both adults' children and live with the adult labeled You.")}
          {cohabiting && hasChildren && " Medicaid estimates use simplified parent/caretaker rules and may misstate eligibility for unmarried parents living together."}
        </p>
      )}
    </div>
  );
}
