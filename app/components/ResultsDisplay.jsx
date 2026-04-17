import React, { useState, useEffect, useMemo, Suspense, lazy } from "react";
import { computeTableData, formatCurrency, PROGRAM_DESCRIPTIONS } from "@/lib/utils";
import { buildCellResults } from "@/lib/api";
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

function DataTable({ rows, emptyMessage }) {
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
      { label: "You (single)", key: "headSingle" },
      { label: "Partner (single)", key: "spouseSingle" },
    ] : []),
    { label: "Not married", key: "notMarried" },
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

const TAB_HEADLINE = {
  summary: {
    agg: (r, health) => r.aggregates[health ? "householdNetIncomeWithHealth" : "householdNetIncome"],
    desc: (m, s, sym) => `Net income: married ${formatCurrency(m, false, sym)} vs. not married ${formatCurrency(s, false, sym)}`,
    invertSign: false,
  },
  taxes: {
    agg: (r) => r.aggregates.householdTaxBeforeCredits,
    desc: (m, s, sym) => `Total taxes: married ${formatCurrency(m, false, sym)} vs. not married ${formatCurrency(s, false, sym)}`,
    invertSign: true,
  },
  benefits: {
    agg: (r, health) => r.aggregates.householdBenefits + (health ? r.aggregates.healthcareBenefitValue : 0),
    desc: (m, s, sym) => `Benefits: married ${formatCurrency(m, false, sym)} vs. not married ${formatCurrency(s, false, sym)}`,
    invertSign: false,
  },
  credits: {
    agg: (r) => r.aggregates.householdRefundableCredits,
    desc: (m, s, sym) => `Credits: married ${formatCurrency(m, false, sym)} vs. not married ${formatCurrency(s, false, sym)}`,
    invertSign: false,
  },
};

function HeadlineBanner({ results, showHealth, activeTab, currencySymbol, countryId }) {
  const [copied, setCopied] = useState(false);
  const { married, headSingle, spouseSingle } = results;
  const sym = currencySymbol;

  const tabInfo = TAB_HEADLINE[activeTab] || TAB_HEADLINE.summary;
  const marriedVal = tabInfo.agg(married, showHealth);
  const separateVal = tabInfo.agg(headSingle, showHealth) + tabInfo.agg(spouseSingle, showHealth);
  let delta = marriedVal - separateVal;
  if (tabInfo.invertSign) delta = -delta;

  const isBonus = delta > 0;
  const isPenalty = delta < 0;
  let label;
  if (isBonus) {
    label = "Marriage bonus";
  } else if (isPenalty) {
    label = "Marriage penalty";
  } else {
    label = "No marriage incentive or penalty";
  }

  function getShareUrl() {
    const hash = window.location.hash;
    const isEmbedded = window.self !== window.top;
    if (isEmbedded) {
      return `https://policyengine.org/${countryId}/marriage${hash}`;
    }
    return window.location.href;
  }

  function handleShare() {
    const url = getShareUrl();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => fallbackCopy(url));
    } else {
      fallbackCopy(url);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const TAB_LABELS = {
    summary: null,
    taxes: "taxes only",
    benefits: "benefits only",
    credits: "credits only",
  };
  const scopeNote = TAB_LABELS[activeTab];

  return (
    <div
      className={["headline-banner", isBonus && "bonus", isPenalty && "penalty"].filter(Boolean).join(" ")}
    >
      <div className="headline-text">
        <span className="headline-label">{label}</span>
        {delta !== 0 && (
          <span className="headline-amount">
            {formatCurrency(delta, true, sym)}/yr
          </span>
        )}
        <span className="headline-desc">
          {tabInfo.desc(marriedVal, separateVal, sym)}
          {scopeNote && <span className="headline-scope"> ({scopeNote})</span>}
        </span>
      </div>
      <div className="headline-actions">
        <button
          className="share-btn"
          onClick={handleShare}
          title="Copy link to clipboard"
        >
          {copied ? "Copied!" : "Share"}
        </button>
      </div>
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
}) {
  const showHealth = !esiStatus?.head && !esiStatus?.spouse;
  const [activeTab, setActiveTab] = useState("summary");
  const [viewMode, setViewMode] = useState("table");
  const [cellSelection, setCellSelection] = useState(null);

  const countryId = country.id;
  const sym = country.currencySymbol;

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
    const m = (results.married.aggregates.householdBenefits || 0) + (results.married.aggregates.healthcareBenefitValue || 0);
    const h = (results.headSingle.aggregates.householdBenefits || 0) + (results.headSingle.aggregates.healthcareBenefitValue || 0);
    const s = (results.spouseSingle.aggregates.householdBenefits || 0) + (results.spouseSingle.aggregates.healthcareBenefitValue || 0);
    markerDelta = m - (h + s);
  } else if (aggKey) {
    const m = results.married.aggregates[aggKey] || 0;
    const h = results.headSingle.aggregates[aggKey] || 0;
    const s = results.spouseSingle.aggregates[aggKey] || 0;
    markerDelta = m - (h + s);
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

  const heatmapProps = heatmapGrid ? {
    grid: heatmapGrid,
    headIncome,
    spouseIncome,
    valentine,
    maxIncome: heatmapData?.maxIncome || 80000,
    count: heatmapData?.count || 33,
    markerDelta,
    onCellClick: heatmapData?.programData ? handleCellClick : undefined,
    selectedCell: cellSelection,
    label: heatmapLabel,
    headLine: combinedHeadLine,
    spouseLine: combinedSpouseLine,
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
      <MetricCards
        results={activeResults}
        showHealth={showHealth}
        currencySymbol={sym}
        countryId={countryId}
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
            <DataTable rows={rows} emptyMessage={EMPTY_MESSAGES[activeTab]} />
          </div>
        )}

        {viewMode === "grid" && heatmapContent && (
          <div className="single-heatmap">
            {heatmapContent}
          </div>
        )}
      </div>
    </div>
  );
}
