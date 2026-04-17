"use client";

import { useState, useEffect, useRef } from "react";
import InputForm from "./components/InputForm";
import ResultsDisplay from "./components/ResultsDisplay";
import SiteHeader from "./components/SiteHeader";
import { getCategorizedPrograms, getHeatmapData } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { getCountry, COUNTRIES } from "@/lib/countries";

const BASE_PATH =
  process.env.NEXT_PUBLIC_BASE_PATH === ""
    ? ""
    : process.env.NEXT_PUBLIC_BASE_PATH || "/us/marriage";

// URL state helpers
function encodeToHash(countryId, formData, isEmbedded) {
  const country = getCountry(countryId);
  const p = new URLSearchParams();
  if (countryId !== "us" && !isEmbedded) p.set("country", countryId);
  p.set("region", formData.regionCode || formData.stateCode);
  p.set("head", formData.headIncome);
  p.set("spouse", formData.spouseIncome);
  if (formData.headAge && formData.headAge !== country.defaultAge) p.set("ha", formData.headAge);
  if (formData.spouseAge && formData.spouseAge !== country.defaultAge) p.set("sa", formData.spouseAge);
  if (formData.disabilityStatus.head) p.set("hd", "1");
  if (formData.disabilityStatus.spouse) p.set("sd", "1");
  if (formData.pregnancyStatus?.head) p.set("hp", "1");
  if (formData.pregnancyStatus?.spouse) p.set("sp", "1");
  if (formData.children.length > 0) {
    p.set(
      "c",
      formData.children
        .map((c) => `${c.age}:${c.isDisabled ? 1 : 0}`)
        .join(","),
    );
  }
  if (formData.esiStatus?.head) p.set("he", "1");
  if (formData.esiStatus?.spouse) p.set("se", "1");
  if (formData.year && formData.year !== country.defaultYear) {
    p.set("year", formData.year);
  }
  return p.toString();
}

function decodeFromHash() {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.slice(1);
  if (!hash) return null;
  try {
    const p = new URLSearchParams(hash);
    const region = p.get("region") || p.get("state");
    if (!region || !p.has("head")) return null;
    const countryId = p.get("country") || "us";
    const country = getCountry(countryId);
    const children = p.has("c")
      ? p
          .get("c")
          .split(",")
          .map((s) => {
            const [age, dis] = s.split(":");
            return { age: Number(age), isDisabled: dis === "1" };
          })
      : [];
    const resolvedRegion = region === "NY" && p.get("nyc") === "1" ? "NYC" : region;
    return {
      countryId,
      regionCode: resolvedRegion,
      stateCode: resolvedRegion,
      headIncome: Number(p.get("head")),
      spouseIncome: Number(p.get("spouse") || 0),
      headAge: Number(p.get("ha") || country.defaultAge),
      spouseAge: Number(p.get("sa") || country.defaultAge),
      disabilityStatus: {
        head: p.get("hd") === "1",
        spouse: p.get("sd") === "1",
      },
      pregnancyStatus: {
        head: p.get("hp") === "1",
        spouse: p.get("sp") === "1",
      },
      esiStatus: {
        head: p.get("he") === "1",
        spouse: p.get("se") === "1",
      },
      children,
      year: p.get("year") || country.defaultYear,
    };
  } catch {
    return null;
  }
}

export default function Page() {
  const decoded = useRef(null);
  const [countryId, setCountryId] = useState("us");
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const country = getCountry(countryId);

  const [results, setResults] = useState(null);
  const [heatmapData, setHeatmapData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState(null);
  const [valentine, setValentine] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [externalIncomes, setExternalIncomes] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const didAutoCalc = useRef(false);

  // Resolve browser-only state after mount
  useEffect(() => {
    decoded.current = decodeFromHash();
    const hashCountry = new URLSearchParams(window.location.hash.slice(1)).get("country");
    // Query-string fallback lets the multizone host send UK visitors to
    // /us/marriage?country=uk (since the zone has a single basePath).
    const queryCountry = new URLSearchParams(window.location.search).get("country");
    const resolvedCountry = decoded.current?.countryId || hashCountry || queryCountry || "us";
    setCountryId(resolvedCountry);
    setIsEmbedded(window.self !== window.top);
    setMounted(true);
  }, []);

  // Swap favicon for valentine mode
  useEffect(() => {
    const link = document.querySelector('link[rel="icon"]');
    if (!link) return;
    if (valentine) {
      link.href = "data:image/svg+xml," + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">'
        + '<circle cx="24" cy="32" r="14" stroke="#DB2777" stroke-width="4" fill="none"/>'
        + '<circle cx="40" cy="32" r="14" stroke="#BE185D" stroke-width="4" fill="none"/>'
        + '<text x="32" y="38" text-anchor="middle" font-family="system-ui,sans-serif" font-size="18" font-weight="700" fill="#EC4899">$</text>'
        + '</svg>'
      );
    } else {
      link.href = `${BASE_PATH}/favicon.svg`;
    }
  }, [valentine]);

  // Valentine mode toggle on "v" key
  useEffect(() => {
    function handleKey(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "v" || e.key === "V") {
        setValentine((prev) => {
          if (!prev) {
            setShowConfetti(true);
            setTimeout(() => setShowConfetti(false), 2500);
          }
          return !prev;
        });
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // Clear results when country changes
  function handleCountryChange(newId) {
    setCountryId(newId);
    setResults(null);
    setHeatmapData(null);
    setFormData(null);
    setError(null);
  }

  async function handleCalculate(data) {
    setFormData(data);
    const hash = `#${encodeToHash(countryId, data, isEmbedded)}`;
    window.history.replaceState(null, "", hash);
    if (window.self !== window.top) {
      window.parent.postMessage({ type: "hashchange", hash }, "*");
    }

    const {
      headIncome, spouseIncome, headAge, spouseAge,
      children, disabilityStatus, pregnancyStatus, esiStatus, year,
    } = data;
    const regionCode = data.regionCode || data.stateCode;
    const effectiveRegion = countryId === "us" && regionCode === "NYC" ? "NY" : regionCode;
    const inNYC = countryId === "us" && regionCode === "NYC";

    setLoading(true);
    setError(null);
    setResults(null);
    setHeatmapData(null);

    try {
      const result = await getCategorizedPrograms(
        countryId, effectiveRegion, headIncome, spouseIncome, children,
        disabilityStatus, year, pregnancyStatus, headAge, spouseAge,
        esiStatus, inNYC,
      );
      setResults(result);
      setLoading(false);

      setHeatmapLoading(true);
      try {
        const heatmap = await getHeatmapData(
          countryId, effectiveRegion, children, disabilityStatus, year,
          pregnancyStatus, headIncome, spouseIncome, headAge, spouseAge,
          esiStatus, inNYC,
        );
        setHeatmapData(heatmap);
      } catch (e) {
        console.error("Heatmap error:", e);
      } finally {
        setHeatmapLoading(false);
      }
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }

  function handleCellClick(headIncome, spouseIncome) {
    setExternalIncomes({ headIncome, spouseIncome });
  }

  // Auto-calculate if URL has params on first load
  useEffect(() => {
    if (!mounted) return;
    if (decoded.current && !didAutoCalc.current) {
      didAutoCalc.current = true;
      handleCalculate(decoded.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  return (
    <div className={`app ${valentine ? "valentine" : ""} ${isEmbedded ? "is-embedded" : "is-standalone"}`}>
      {valentine && <div className="hearts-bg" aria-hidden="true" />}
      {showConfetti && (
        <div className="heart-confetti" aria-hidden="true">
          {Array.from({ length: 24 }, (_, i) => (
            <span key={i} className="confetti-heart" style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 0.5}s`,
              animationDuration: `${1.5 + Math.random() * 1.5}s`,
              fontSize: `${14 + Math.random() * 18}px`,
              opacity: 0.7 + Math.random() * 0.3,
            }} />
          ))}
        </div>
      )}

      {!isEmbedded && <SiteHeader />}

      <div className="app-shell">
        <header className="app-header">
          <div className="header-text">
            <h1>{valentine ? "Love & taxes calculator" : "Marriage calculator"}</h1>
            <p>
              {valentine
                ? "Will tying the knot cost you? Find out this Valentine\u2019s Day."
                : <>See how marriage would change your taxes and benefits. <span className="vday-hint">&hearts; Press V</span></>}
            </p>
          </div>
        </header>

        <div className="app-layout">
          <aside className={`app-sidebar ${results ? "has-results" : ""} ${sidebarOpen ? "sidebar-open" : ""}`}>
            {results && (
              <button
                type="button"
                className="sidebar-toggle"
                onClick={() => setSidebarOpen((v) => !v)}
              >
                <span className="sidebar-toggle-summary">
                  {formData?.regionCode || formData?.stateCode} &middot; {formatCurrency(formData?.headIncome ?? 0, false, country.currencySymbol)} &amp; {formatCurrency(formData?.spouseIncome ?? 0, false, country.currencySymbol)}
                </span>
                <span className="sidebar-toggle-arrow">{sidebarOpen ? "\u25B2" : "\u25BC"}</span>
              </button>
            )}
            <div className="sidebar-collapsible">
              <InputForm
                country={country}
                countries={isEmbedded ? null : COUNTRIES}
                countryId={countryId}
                onCountryChange={handleCountryChange}
                onCalculate={(data) => { setSidebarOpen(false); handleCalculate(data); }}
                onInputChange={() => { setResults(null); setHeatmapData(null); }}
                loading={loading}
                initialValues={decoded.current}
                externalIncomes={externalIncomes}
              />
            </div>
          </aside>

          <main className="app-main">
            {error && <div className="error">{error}</div>}

            {loading && (
              <div className="main-placeholder">
                <span className="spinner" /> Calculating...
              </div>
            )}

            {!results && !loading && (
              <div className="main-placeholder main-placeholder--intro">
                <div className="intro-card">
                  <h2>What would marriage mean for your taxes?</h2>
                  <p>
                    Tax and benefit rules can reward or punish marriage. Enter
                    your household details on the left and we&rsquo;ll compare
                    your net income if you stay single or tie the knot, program
                    by program.
                  </p>
                  <ul className="intro-highlights">
                    <li>Federal and state taxes</li>
                    <li>Means-tested benefits and credits</li>
                    <li>Income heatmap across the full income range</li>
                  </ul>
                  <p className="intro-cta">Press <strong>Calculate</strong> to begin.</p>
                </div>
              </div>
            )}

            {results && (
              <ResultsDisplay
                results={results}
                heatmapData={heatmapData}
                heatmapLoading={heatmapLoading}
                headIncome={formData?.headIncome ?? 0}
                spouseIncome={formData?.spouseIncome ?? 0}
                valentine={valentine}
                onCellClick={handleCellClick}
                esiStatus={formData?.esiStatus}
                country={country}
              />
            )}
          </main>
        </div>

        <footer className="app-footer">
          <span>
            Powered by{" "}
            <a href="https://policyengine.org" target="_blank" rel="noopener noreferrer">PolicyEngine</a>
            {!isEmbedded && (
              <> &middot; <a href="https://github.com/PolicyEngine/marriage" target="_blank" rel="noopener noreferrer">Source on GitHub</a></>
            )}
          </span>
        </footer>
      </div>
    </div>
  );
}
