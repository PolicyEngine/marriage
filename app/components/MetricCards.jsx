import React, { useState } from "react";
import { formatCurrency, formatPercent, unmarriedTotal } from "@/lib/utils";

function getShareUrl(countryId) {
  const hash = window.location.hash;
  const isEmbedded = window.self !== window.top;
  if (isEmbedded) {
    return `https://policyengine.org/${countryId}/marriage${hash}`;
  }
  return window.location.href;
}

export default function MetricCards({ results, showHealth, currencySymbol, countryId, livingArrangement }) {
  const sym = currencySymbol || "$";
  const { married } = results;
  const [copied, setCopied] = useState(false);

  const netKey = showHealth ? "householdNetIncomeWithHealth" : "householdNetIncome";
  const netMarried = married.aggregates[netKey];
  const netSeparate = unmarriedTotal(results, "aggregates", netKey);
  const delta = netMarried - netSeparate;
  const pctChange = netSeparate !== 0 ? delta / netSeparate : 0;

  const isBonus = delta > 0;
  const isPenalty = delta < 0;

  const deltaClass = [
    "metric-card highlight",
    isBonus ? "bonus" : "",
    isPenalty ? "penalty" : "",
  ].filter(Boolean).join(" ");

  const combinesHouseholds = countryId === "us" && livingArrangement === "separate";
  const deltaLabel = isBonus ? (combinesHouseholds ? "Increase" : "Marriage bonus")
    : isPenalty ? (combinesHouseholds ? "Decrease" : "Marriage penalty") : "No change";
  const unmarriedLabel = countryId === "us"
    ? `Unmarried, ${results.unmarried ? "living together" : "living separately"}`
    : "Not married";

  function handleShare() {
    const url = getShareUrl(countryId);
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

  return (
    <div className="metric-cards">
      <div className="metric-card" data-testid="metric-net">
        <div className="metric-label">{unmarriedLabel}</div>
        <div className="metric-value">{formatCurrency(netSeparate, false, sym)}</div>
        <div className="metric-desc">{results.unmarried ? "Household net income" : "Combined net income"}</div>
      </div>

      <div className="metric-card" data-testid="metric-pct">
        <div className="metric-label">Married</div>
        <div className="metric-value">{formatCurrency(netMarried, false, sym)}</div>
        <div className="metric-desc">Household net income</div>
      </div>

      <div className={deltaClass} data-testid="metric-delta">
        <div className="metric-label-row">
          <span className="metric-label">{deltaLabel}</span>
          <button className="share-icon-btn" onClick={handleShare} title={copied ? "Copied!" : "Copy link"} aria-label="Copy link">
            {copied ? "\u2713" : "\u2197"}
          </button>
        </div>
        <div className="metric-value">
          {delta === 0 ? formatCurrency(0, false, sym) : formatCurrency(delta, true, sym)}
        </div>
        <div className="metric-desc">{formatPercent(pctChange, true)}</div>
      </div>
    </div>
  );
}
