"use client";

import { useState, useEffect, useRef } from "react";
import InputForm from "./components/InputForm";
import ResultsDisplay from "./components/ResultsDisplay";
import { getCategorizedPrograms, getHeatmapData } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { getCountry, COUNTRIES, DEFAULT_COUNTRY, LEGACY_HASH_COUNTRY, DEFAULT_BRMA } from "@/lib/countries";

const BASE_PATH =
  process.env.NEXT_PUBLIC_BASE_PATH === ""
    ? ""
    : process.env.NEXT_PUBLIC_BASE_PATH || "/us/marriage";

// URL state helpers
export function encodeToHash(countryId, formData, isEmbedded) {
  const country = getCountry(countryId);
  const p = new URLSearchParams();
  // Always record the country. Leaving it out to keep the default short made
  // every hash depend on what the default happens to be, which is how existing
  // US links broke when the default moved to the UK. Embedded pages take their
  // country from the route, so they still omit it.
  if (!isEmbedded) p.set("country", countryId);
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
  p.set("year", formData.year || country.defaultYear);
  if (countryId === "us") {
    p.set("living", formData.livingArrangement || "cohabiting");
    if (formData.ccdfSlotAvailable === false) p.set("ccdf_slot", "0");
    if (formData.childcareCounty) p.set("county", formData.childcareCounty);
    if (formData.childcareWorkHours?.head != null && formData.childcareWorkHours.head !== 40) p.set("hwh", formData.childcareWorkHours.head);
    if (formData.childcareWorkHours?.spouse != null && formData.childcareWorkHours.spouse !== 40) p.set("swh", formData.childcareWorkHours.spouse);
    if (formData.includeHeadStart) p.set("hs", "1");
    if ((formData.regionCode || formData.stateCode) === "NV" && formData.childcareActivityEligible) p.set("cae", "1");
    const childDetails = formData.children.map((child) => ({
      ...(child.isHeadStartEnrolled ? { isHeadStartEnrolled: true } : {}),
      ...(child.childcareCost ? { childcareCost: child.childcareCost } : {}),
      ...(child.childcareHoursPerDay != null && child.childcareHoursPerDay !== 8 ? { childcareHoursPerDay: child.childcareHoursPerDay } : {}),
      ...(child.childcareDaysPerWeek != null && child.childcareDaysPerWeek !== 5 ? { childcareDaysPerWeek: child.childcareDaysPerWeek } : {}),
      ...(child.childcareDaysPerMonth != null && child.childcareDaysPerMonth !== 22 ? { childcareDaysPerMonth: child.childcareDaysPerMonth } : {}),
      ...(Object.keys(child.childcareProviders || {}).length ? { childcareProviders: child.childcareProviders } : {}),
    }));
    if (childDetails.some((child) => Object.keys(child).length)) p.set("care", JSON.stringify(childDetails));
  }
  // UK Universal Credit inputs. Only written when non-default so existing
  // shared links keep their current shape.
  if (formData.rent) p.set("rent", formData.rent);
  if (formData.tenureType && formData.tenureType !== "OWNED_OUTRIGHT") {
    p.set("tenure", formData.tenureType);
  }
  if (formData.brma && formData.brma !== DEFAULT_BRMA) p.set("brma", formData.brma);
  if (formData.childcareCosts) p.set("cc", formData.childcareCosts);
  if (formData.savings) p.set("sav", formData.savings);
  if (formData.carerStatus?.head) p.set("hc", "1");
  if (formData.carerStatus?.spouse) p.set("sc", "1");
  if (formData.selfEmploymentIncome?.head) p.set("hse", formData.selfEmploymentIncome.head);
  if (formData.selfEmploymentIncome?.spouse) p.set("sse", formData.selfEmploymentIncome.spouse);
  if (formData.pensionIncome?.head) p.set("hpi", formData.pensionIncome.head);
  if (formData.pensionIncome?.spouse) p.set("spi", formData.pensionIncome.spouse);
  return p.toString();
}

export function decodeFromHash() {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.slice(1);
  if (!hash) return null;
  try {
    const p = new URLSearchParams(hash);
    const region = p.get("region") || p.get("state");
    if (!region || !p.has("head")) return null;
    // A hash with no country was written before the country was recorded, and
    // every one of those is a US link: the UK route did not exist then. Reading
    // them as the current default would send a US state to the UK model.
    const countryId = p.get("country") || LEGACY_HASH_COUNTRY;
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
    if (countryId === "us" && p.has("care")) {
      const details = JSON.parse(p.get("care"));
      if (Array.isArray(details)) children.forEach((child, index) => {
        const detail = details[index] || {};
        child.isHeadStartEnrolled = detail.isHeadStartEnrolled === true;
        for (const key of ["childcareCost", "childcareHoursPerDay", "childcareDaysPerWeek", "childcareDaysPerMonth"]) {
          if (detail[key] != null && Number.isFinite(Number(detail[key]))) child[key] = Math.max(0, Number(detail[key]));
        }
        if (detail.childcareProviders && typeof detail.childcareProviders === "object" && !Array.isArray(detail.childcareProviders)) {
          child.childcareProviders = Object.fromEntries(Object.entries(detail.childcareProviders).filter(([, value]) => typeof value === "string"));
        }
      });
    }
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
      ...(countryId === "us" ? {
        ccdfSlotAvailable: p.get("ccdf_slot") !== "0",
        childcareCounty: p.get("county") || "",
        childcareWorkHours: { head: Number(p.get("hwh") ?? 40), spouse: Number(p.get("swh") ?? 40) },
        includeHeadStart: p.get("hs") === "1",
        childcareActivityEligible: resolvedRegion === "NV" && p.get("cae") === "1",
      } : {}),
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
      // Links created before this choice existed compared separate homes.
      livingArrangement: countryId === "us" && p.get("living") === "cohabiting"
        ? "cohabiting" : "separate",
      rent: Number(p.get("rent") || 0),
      tenureType: p.get("tenure") || "OWNED_OUTRIGHT",
      brma: p.get("brma") || DEFAULT_BRMA,
      childcareCosts: Number(p.get("cc") || 0),
      savings: Number(p.get("sav") || 0),
      carerStatus: { head: p.get("hc") === "1", spouse: p.get("sc") === "1" },
      selfEmploymentIncome: {
        head: Number(p.get("hse") || 0),
        spouse: Number(p.get("sse") || 0),
      },
      pensionIncome: {
        head: Number(p.get("hpi") || 0),
        spouse: Number(p.get("spi") || 0),
      },
    };
  } catch {
    return null;
  }
}

export default function MarriageApp({ initialCountry = null }) {
  const decoded = useRef(null);
  // Seed with initialCountry — supplied by the server component from the
  // rewrite destination's ?country= query, since Next rewrites are reverse
  // proxies and the browser URL (hence window.location.search) stays at the
  // host path. Keeping it in useState's initial value makes SSR and the first
  // client render agree, so /uk/marriage hydrates straight into UK.
  const [countryId, setCountryId] = useState(initialCountry || DEFAULT_COUNTRY);
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const country = getCountry(countryId);

  const [results, setResults] = useState(null);
  const [heatmapData, setHeatmapData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [error, setError] = useState(null);
  const [heatmapError, setHeatmapError] = useState(null);
  const [formData, setFormData] = useState(null);
  const [valentine, setValentine] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [externalIncomes, setExternalIncomes] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [guidedSetup, setGuidedSetup] = useState(true);
  const resultsPanel = useRef(null);
  const focusEditor = useRef(false);
  const inputPanel = useRef(null);
  const didAutoCalc = useRef(false);
  const calculationId = useRef(0);
  const activeRequest = useRef(null);
  const retrySnapshot = useRef(null);

  useEffect(() => () => activeRequest.current?.abort(), []);

  // Resolve browser-only state after mount.
  // initialCountry already seeded countryId (for the rewrite path), so it
  // stays in the chain here as the final fallback before the default country.
  useEffect(() => {
    decoded.current = decodeFromHash();
    const hashCountry = new URLSearchParams(window.location.hash.slice(1)).get("country");
    const resolvedCountry = decoded.current?.countryId || hashCountry || initialCountry || DEFAULT_COUNTRY;
    setCountryId(resolvedCountry);
    setIsEmbedded(window.self !== window.top);
    setGuidedSetup(!decoded.current);
    setMounted(true);
  }, [initialCountry]);

  useEffect(() => {
    if (loading) resultsPanel.current?.focus();
  }, [loading]);

  useEffect(() => {
    if (!guidedSetup && focusEditor.current) {
      inputPanel.current?.querySelector("button, input")?.focus();
      focusEditor.current = false;
    }
  }, [guidedSetup]);

  // Fire the tool_engaged conversion event after the user has been on
  // the page long enough to count as genuinely engaged. Matches the
  // 15-second threshold and event shape used by policyengine-app-v2's
  // AppClient so these conversions feed into the same GA4/Google Ads
  // reporting as the other tools.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof window !== "undefined" && window.gtag) {
        window.gtag("event", "tool_engaged", {
          tool_name: "marriage",
          tool_title: "Marriage Tax Calculator",
        });
      }
    }, 15000);
    return () => clearTimeout(timer);
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
    decoded.current = null;
    setCountryId(newId);
    clearResults();
    setFormData(null);
  }

  function clearResults() {
    // A request from the previous living arrangement must not repopulate the
    // page after an input has changed.
    calculationId.current += 1;
    activeRequest.current?.abort();
    activeRequest.current = null;
    retrySnapshot.current = null;
    setResults(null);
    setHeatmapData(null);
    setLoading(false);
    setHeatmapLoading(false);
    setError(null);
    setHeatmapError(null);
    setExternalIncomes(null);
  }

  function updateHash(data) {
    const hash = `#${encodeToHash(countryId, data, isEmbedded)}`;
    window.history.replaceState(null, "", hash);
    if (window.self !== window.top) {
      window.parent.postMessage({ type: "hashchange", hash }, "*");
    }
  }

  function requestArguments(snapshot, signal) {
    const { data, countryId: requestCountry } = snapshot;
    const {
      headIncome, spouseIncome, headAge, spouseAge,
      children, disabilityStatus, pregnancyStatus, esiStatus, year,
    } = data;
    const extras = {
      signal,
      livingArrangement: data.livingArrangement || "cohabiting",
      rent: data.rent || 0,
      tenureType: data.tenureType || "OWNED_OUTRIGHT",
      brma: data.brma || DEFAULT_BRMA,
      savings: data.savings || 0,
      childcareCosts: data.childcareCosts || 0,
      carerStatus: data.carerStatus || {},
      selfEmploymentIncome: data.selfEmploymentIncome || {},
      pensionIncome: data.pensionIncome || {},
      ccdfSlotAvailable: data.ccdfSlotAvailable !== false,
      childcareCounty: data.childcareCounty || "",
      childcareWorkHours: data.childcareWorkHours || { head: 40, spouse: 40 },
      includeHeadStart: data.includeHeadStart || false,
      childcareActivityEligible: (data.regionCode || data.stateCode) === "NV" && Boolean(data.childcareActivityEligible),
    };
    const regionCode = data.regionCode || data.stateCode;
    const effectiveRegion = requestCountry === "us" && regionCode === "NYC" ? "NY" : regionCode;
    const inNYC = requestCountry === "us" && regionCode === "NYC";
    return {
      scalar: [requestCountry, effectiveRegion, headIncome, spouseIncome, children,
        disabilityStatus, year, pregnancyStatus, headAge, spouseAge, esiStatus, inNYC, extras],
      heatmap: [requestCountry, effectiveRegion, children, disabilityStatus, year,
        pregnancyStatus, headIncome, spouseIncome, headAge, spouseAge, esiStatus, inNYC, extras],
    };
  }

  function startRequest() {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    return { requestId: ++calculationId.current, controller };
  }

  async function loadHeatmap(snapshot, requestId, controller) {
    setHeatmapLoading(true);
    setHeatmapError(null);
    try {
      const heatmap = await getHeatmapData(...requestArguments(snapshot, controller.signal).heatmap);
      if (requestId !== calculationId.current || controller.signal.aborted) return;
      setHeatmapData(heatmap);
    } catch (e) {
      if (requestId !== calculationId.current || controller.signal.aborted) return;
      setHeatmapError(e.message || "The heatmap could not be calculated. Please try again.");
      // A failed comparison must also stop any sibling fetches still running.
      controller.abort();
    } finally {
      if (requestId === calculationId.current) {
        setHeatmapLoading(false);
        activeRequest.current = null;
      }
    }
  }

  async function handleCalculate(data) {
    setGuidedSetup(false);
    // Retry the submitted values, never a partially edited form or mutable
    // object retained by the caller. Country changes clear this snapshot.
    const snapshot = { countryId, data: structuredClone(data) };
    retrySnapshot.current = snapshot;
    const { requestId, controller } = startRequest();
    setFormData(snapshot.data);
    updateHash(snapshot.data);

    setLoading(true);
    setError(null);
    setHeatmapError(null);
    setHeatmapLoading(false);
    setResults(null);
    setHeatmapData(null);

    try {
      const result = await getCategorizedPrograms(...requestArguments(snapshot, controller.signal).scalar);
      if (requestId !== calculationId.current || controller.signal.aborted) return;
      setResults(result);
      setLoading(false);

      await loadHeatmap(snapshot, requestId, controller);
    } catch (e) {
      if (requestId !== calculationId.current || controller.signal.aborted) return;
      setError(e.message || "The calculation could not be completed. Please try again.");
      setLoading(false);
      controller.abort();
      activeRequest.current = null;
    }
  }

  function retryCalculation() {
    if (retrySnapshot.current) handleCalculate(retrySnapshot.current.data);
  }

  function retryHeatmap() {
    if (!retrySnapshot.current || !results) return;
    const { requestId, controller } = startRequest();
    loadHeatmap(retrySnapshot.current, requestId, controller);
  }

  function handleCellClick(headIncome, spouseIncome) {
    setExternalIncomes({ headIncome, spouseIncome });
    const data = { ...formData, headIncome, spouseIncome };
    setFormData(data);
    updateHash(data);
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

        <div className={`app-layout${guidedSetup ? " app-layout--wizard" : ""}`}>
          <aside
            className={`app-sidebar ${results ? "has-results" : ""} ${sidebarOpen ? "sidebar-open" : ""}`}
            role={guidedSetup ? "region" : undefined}
            aria-label={guidedSetup ? "Set up your comparison" : "Your inputs"}
          >
            {results && !guidedSetup && (
              <button
                type="button"
                className="sidebar-toggle"
                onClick={() => setSidebarOpen((v) => !v)}
                aria-expanded={sidebarOpen}
                aria-controls="comparison-inputs"
              >
                <span className="sidebar-toggle-summary">
                  {formData?.regionCode || formData?.stateCode} &middot; {formatCurrency(formData?.headIncome ?? 0, false, country.currencySymbol)} &amp; {formatCurrency(formData?.spouseIncome ?? 0, false, country.currencySymbol)}
                </span>
                <span className="sidebar-toggle-arrow">{sidebarOpen ? "\u25B2" : "\u25BC"}</span>
              </button>
            )}
            <div className="sidebar-collapsible" id="comparison-inputs">
              {!guidedSetup && (
                <div className="editor-heading">
                  <h2>Your inputs</h2>
                  <button type="button" onClick={() => { setGuidedSetup(true); setSidebarOpen(true); }}>
                    Guided setup
                  </button>
                </div>
              )}
              <div className="input-form-container" ref={inputPanel}>
                <InputForm
                  key={mounted ? "ready" : "initial"}
                  mode={guidedSetup ? "wizard" : "editor"}
                  onExitWizard={() => { focusEditor.current = true; setGuidedSetup(false); }}
                  country={country}
                  countries={isEmbedded ? null : COUNTRIES}
                  countryId={countryId}
                  onCountryChange={handleCountryChange}
                  onCalculate={(data) => { setSidebarOpen(false); handleCalculate(data); }}
                  onInputChange={clearResults}
                  loading={loading}
                  initialValues={decoded.current}
                  externalIncomes={externalIncomes}
                />
              </div>
            </div>
          </aside>

          <section className="app-main" hidden={guidedSetup} ref={resultsPanel} tabIndex={-1} aria-label="Comparison results">
            {error && <div className="error" role="alert">
              <p>{error}</p>
              <button type="button" className="mt-3 rounded-md bg-primary px-4 py-2 font-medium text-white"
                onClick={retryCalculation}>Retry calculation</button>
            </div>}

            {loading && (
              <div className="main-placeholder" role="status">
                <span className="spinner" /> Calculating...
              </div>
            )}

            {!results && !loading && !error && (
              <div className="main-placeholder main-placeholder--intro">
                <div className="intro-card">
                  <h2>Calculate your comparison</h2>
                  <p>
                    Review your inputs and select Calculate to compare financial
                    resources, taxes, benefits, and service values.
                  </p>
                  <ul className="intro-highlights">
                    <li>A breakdown by program</li>
                    <li>Healthcare and early education shown separately</li>
                    <li>An income grid to explore other earnings</li>
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
                heatmapError={heatmapError}
                onRetryHeatmap={retryHeatmap}
                headIncome={formData?.headIncome ?? 0}
                spouseIncome={formData?.spouseIncome ?? 0}
                valentine={valentine}
                onCellClick={handleCellClick}
                esiStatus={formData?.esiStatus}
                country={country}
                livingArrangement={formData?.livingArrangement}
                hasChildren={Boolean(formData?.children?.length)}
              />
            )}
          </section>
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
