import React, { useState, useRef, useMemo, useId } from "react";
import {
  interpolateColor,
  isLightColor,
  TEAL_SCALE,
  VALENTINE_SCALE,
  fmtDollar,
  fmtShortDollar,
} from "@/lib/heatmap-utils";

const SVG_W = 650;
const SVG_H = 500;
const MARGIN = { top: 10, right: 90, bottom: 50, left: 60 };
const FONT = "Inter, -apple-system, BlinkMacSystemFont, sans-serif";

export default function Heatmap({
  grid,
  headIncome,
  spouseIncome,
  valentine,
  maxIncome = 80000,
  count = 33,
  markerDelta = null,
  onCellClick,
  selectedCell,
  label = "Net Change",
  headLine,
  spouseLine,
  currencySymbol = "$",
  invertDelta = false,
}) {
  const gradId = useId().replace(/:/g, "");
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);

  const colorscale = valentine ? VALENTINE_SCALE : TEAL_SCALE;

  // Precompute cell colors (before early returns so hooks are always called)
  const { cellColors, absMax, zMin, zMax } = useMemo(() => {
    if (!grid || grid.length === 0)
      return { cellColors: [], absMax: 0, zMin: 0, zMax: 0 };
    const flat = grid.flat();
    const am = Math.max(...flat.map(Math.abs));
    return {
      absMax: am,
      zMin: -am,
      zMax: am,
      cellColors: grid.map((row) =>
        row.map((val) => {
          const t = am > 0 ? (val + am) / (2 * am) : 0.5;
          return interpolateColor(colorscale, t);
        }),
      ),
    };
  }, [grid, colorscale]);

  // Early returns
  if (!grid || grid.length === 0) {
    return <p className="loading">No heatmap data available.</p>;
  }
  if (grid.every((row) => row.every((v) => v === 0))) {
    return <p className="loading">No changes in the net income data.</p>;
  }

  const step = maxIncome / (count - 1);
  const tickLabels = Array.from({ length: count }, (_, i) => {
    const val = i * step;
    if (val === 0) return `${currencySymbol}0`;
    return `${currencySymbol}${val / 1000}k`;
  });
  const tickInterval = count > 20 ? 4 : 2;

  const accentColor = valentine ? "#BE185D" : "#D97706";
  const hasBeforeAfter =
    headLine && spouseLine && headLine.length === count && spouseLine.length === count;

  // Marker position
  const defaultXi = Math.min(count - 1, Math.max(0, Math.round(headIncome / step)));
  const defaultYi = Math.min(count - 1, Math.max(0, Math.round(spouseIncome / step)));
  const xi = selectedCell ? selectedCell.headIdx : defaultXi;
  const yi = selectedCell ? selectedCell.spouseIdx : defaultYi;
  const cellVal = grid[yi]?.[xi] ?? 0;
  const onDark = absMax > 0 && Math.abs(cellVal) / absMax > 0.45;

  // Plot geometry
  const plotW = SVG_W - MARGIN.left - MARGIN.right;
  const plotH = SVG_H - MARGIN.top - MARGIN.bottom;
  const cellW = plotW / count;
  const cellH = plotH / count;

  // Coordinate helpers: headIdx → SVG x, spouseIdx → SVG y (inverted)
  const cx = (hi) => MARGIN.left + hi * cellW;
  const cy = (si) => MARGIN.top + (count - 1 - si) * cellH;

  // Convert mouse client coords to grid cell
  function getCellFromEvent(e) {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const inv = ctm.inverse();
    const svgX = inv.a * e.clientX + inv.c * e.clientY + inv.e;
    const svgY = inv.b * e.clientX + inv.d * e.clientY + inv.f;
    const hi = Math.floor((svgX - MARGIN.left) / cellW);
    const si = count - 1 - Math.floor((svgY - MARGIN.top) / cellH);
    if (hi >= 0 && hi < count && si >= 0 && si < count) return { hi, si };
    return null;
  }

  function handleMouseMove(e) {
    const cell = getCellFromEvent(e);
    if (!cell) {
      setTooltip(null);
      return;
    }
    const { hi, si } = cell;
    const rect = containerRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const val = grid[si][hi];
    // Grid values may be negated for inverted variables (e.g. taxes).
    // rawDelta is the actual married-minus-unmarried difference.
    const rawDelta = invertDelta ? -val : val;
    const data = {
      px,
      py,
      bgColor: cellColors[si][hi],
      headLabel: tickLabels[hi],
      spouseLabel: tickLabels[si],
      delta: val,
    };
    if (hasBeforeAfter) {
      data.notMarried = Math.round(headLine[hi] || 0) + Math.round(spouseLine[si] || 0);
      data.married = data.notMarried + rawDelta;
    }
    setTooltip(data);
  }

  function handleClick(e) {
    if (!onCellClick) return;
    const cell = getCellFromEvent(e);
    if (cell) onCellClick(cell.hi, cell.si);
  }

  // Color bar
  const barX = SVG_W - MARGIN.right + 12;
  const barW = 14;
  const barH = plotH * 0.9;
  const barY = MARGIN.top + (plotH - barH) / 2;

  // Compute nice round tick values for the color bar
  const barTicks = useMemo(() => {
    if (absMax === 0) return [{ val: 0, y: barY + barH / 2 }];
    const rawStep = absMax / 2;
    const order = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const frac = rawStep / order;
    const step = frac <= 1.5 ? order : frac <= 3.5 ? 2 * order : frac <= 7.5 ? 5 * order : 10 * order;
    const ticks = [0];
    for (let v = step; v <= absMax; v += step) {
      ticks.push(v);
      ticks.push(-v);
    }
    ticks.sort((a, b) => a - b);
    return ticks.map((val) => ({
      val,
      y: barY + barH * (1 - (val + absMax) / (2 * absMax)),
    }));
  }, [absMax, barY, barH]);

  // Marker geometry
  const mx = cx(xi) + cellW / 2;
  const my = cy(yi) + cellH / 2;
  const ds = Math.min(cellW, cellH) * 0.45;
  const diamondPts = `${mx},${my - ds} ${mx + ds},${my} ${mx},${my + ds} ${mx - ds},${my}`;
  const markerColor = onDark ? "white" : accentColor;

  // Tooltip positioning: flip left when near right edge
  let tooltipLeft = 0;
  let tooltipRight;
  if (tooltip && containerRef.current) {
    const nearRightEdge = tooltip.px > containerRef.current.clientWidth * 0.65;
    if (nearRightEdge) {
      tooltipLeft = undefined;
      tooltipRight = containerRef.current.clientWidth - tooltip.px + 14;
    } else {
      tooltipLeft = tooltip.px + 14;
    }
  }

  return (
    <div className="heatmap-section">
      <h2>Change in {label}</h2>
      <div
        ref={containerRef}
        style={{
          position: "relative",
          width: "100%",
          cursor: onCellClick ? "crosshair" : "default",
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          style={{
            width: "100%",
            height: "auto",
            display: "block",
          }}
          preserveAspectRatio="xMidYMid meet"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setTooltip(null)}
          onClick={handleClick}
        >
          <defs>
            <linearGradient id={`cb-${gradId}`} x1="0" y1="1" x2="0" y2="0">
              {colorscale.map(([stop, color], i) => (
                <stop key={i} offset={`${stop * 100}%`} stopColor={color} />
              ))}
            </linearGradient>
          </defs>

          {/* Grid cells */}
          {grid.map((row, si) =>
            row.map((_, hi) => (
              <rect
                key={`${si}-${hi}`}
                x={cx(hi)}
                y={cy(si)}
                width={cellW}
                height={cellH}
                fill={cellColors[si][hi]}
                stroke="white"
                strokeWidth={0.5}
              />
            )),
          )}

          {/* Selected cell highlight */}
          {selectedCell && (
            <rect
              x={cx(selectedCell.headIdx)}
              y={cy(selectedCell.spouseIdx)}
              width={cellW}
              height={cellH}
              fill="none"
              stroke={accentColor}
              strokeWidth={2.5}
            />
          )}

          {/* Marker */}
          {valentine ? (
            <text
              x={mx}
              y={my}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={Math.min(cellW, cellH) * 1.1}
              fill={markerColor}
              fontFamily={FONT}
              fontWeight={700}
              style={{ pointerEvents: "none" }}
            >
              {"\u2764\uFE0F"} You
            </text>
          ) : (
            <g style={{ pointerEvents: "none" }}>
              <polygon
                points={diamondPts}
                fill="rgba(0,0,0,0)"
                stroke={markerColor}
                strokeWidth={2}
              />
              <text
                x={mx}
                y={my - ds - 3}
                textAnchor="middle"
                fontSize={9}
                fontWeight={700}
                fill={markerColor}
                fontFamily={FONT}
              >
                You
              </text>
            </g>
          )}

          {/* X-axis tick labels */}
          {Array.from({ length: count }, (_, i) => i)
            .filter((i) => i % tickInterval === 0)
            .map((i) => (
              <text
                key={`xt-${i}`}
                x={cx(i) + cellW / 2}
                y={MARGIN.top + plotH + 16}
                textAnchor="middle"
                fontSize={9}
                fill="#667085"
                fontFamily={FONT}
              >
                {tickLabels[i]}
              </text>
            ))}

          {/* X-axis title */}
          <text
            x={MARGIN.left + plotW / 2}
            y={SVG_H - 5}
            textAnchor="middle"
            fontSize={11}
            fill="#1A1A1A"
            fontFamily={FONT}
          >
            Your income
          </text>

          {/* Y-axis tick labels */}
          {Array.from({ length: count }, (_, i) => i)
            .filter((i) => i % tickInterval === 0)
            .map((i) => (
              <text
                key={`yt-${i}`}
                x={MARGIN.left - 5}
                y={cy(i) + cellH / 2}
                textAnchor="end"
                dominantBaseline="central"
                fontSize={9}
                fill="#667085"
                fontFamily={FONT}
              >
                {tickLabels[i]}
              </text>
            ))}

          {/* Y-axis title */}
          <text
            x={12}
            y={MARGIN.top + plotH / 2}
            textAnchor="middle"
            fontSize={11}
            fill="#1A1A1A"
            fontFamily={FONT}
            transform={`rotate(-90, 12, ${MARGIN.top + plotH / 2})`}
          >
            {"Partner\u2019s income"}
          </text>

          {/* Color bar gradient */}
          <rect
            x={barX}
            y={barY}
            width={barW}
            height={barH}
            fill={`url(#cb-${gradId})`}
            rx={2}
          />

          {/* Color bar ticks */}
          {barTicks.map(({ val, y }, i) => (
            <g key={`cbt-${i}`}>
              <line
                x1={barX + barW}
                y1={y}
                x2={barX + barW + 4}
                y2={y}
                stroke="#9CA3AF"
                strokeWidth={0.5}
              />
              <text
                x={barX + barW + 6}
                y={y}
                dominantBaseline="central"
                fontSize={8}
                fill="#667085"
                fontFamily={FONT}
              >
                {fmtShortDollar(val, currencySymbol)}
              </text>
            </g>
          ))}

          {/* PolicyEngine logo watermark */}
          <g
            opacity={0.15}
            style={{ pointerEvents: "none" }}
            transform={`translate(${SVG_W - MARGIN.right - 34}, ${SVG_H - MARGIN.bottom - 34}) scale(${30 / 244})`}
          >
            <path d="M28 103.6V0.8h43.4c8.7 0 15.6 1.6 20.7 4.8 5.1 3.1 8.7 7.2 10.9 12.1 2.2 4.9 3.3 10 3.3 15.4 0 3.7-.7 7.5-2 11.3-1.3 3.8-3.3 7.3-6.1 10.4-2.7 3.2-6.3 5.7-10.8 7.7-4.4 1.9-9.7 2.9-16 2.9H47v38.3H28zm19-56.3h25.3c3.5 0 6.3-.7 8.4-2.1 2.2-1.5 3.7-3.3 4.6-5.1.9-2.2 1.4-4.5 1.4-6.7 0-2.1-.4-4.2-1.3-6.4-.8-2.3-2.3-4.1-4.4-5.5-2.1-1.5-5-2.3-8.7-2.3H47v28.1z" fill="#2C7A7B"/>
            <path d="M140.8 243.2V140.4H210v18.1h-50.2v22.6h29.9v18.1h-29.9v25.9H210v18.2H140.8z" fill="#2C7A7B"/>
            <path fillRule="evenodd" clipRule="evenodd" d="M104 140.4H.8v18.4h84.8v84.5H104V158.8h-18.4v-11h18.4v-7.4z" fill="#2C7A7B" fillOpacity={0.3}/>
            <path d="M104 158.7v-11H85.6v11H104z" fill="#2C7A7B" fillOpacity={0.3}/>
            <path fillRule="evenodd" clipRule="evenodd" d="M140.7 103.6v-7.3h18.4V85.3h84.2v18.4H140.7z" fill="#2C7A7B" fillOpacity={0.3}/>
            <path d="M140.7.8v84.5h18.4V.8h-18.4z" fill="#2C7A7B" fillOpacity={0.3}/>
            <path d="M140.7 85.3v11h18.4v-11h-18.4z" fill="#2C7A7B" fillOpacity={0.3}/>
          </g>
        </svg>

        {/* HTML tooltip overlay */}
        {tooltip && (
          <div
            style={{
              position: "absolute",
              left: tooltipLeft,
              right: tooltipRight,
              top: tooltip.py,
              transform: "translateY(-50%)",
              background: tooltip.bgColor,
              color: isLightColor(tooltip.bgColor) ? "#1A1A1A" : "white",
              padding: "8px 12px",
              borderRadius: 6,
              fontSize: "0.9rem",
              lineHeight: 1.6,
              pointerEvents: "none",
              border: `1px solid ${isLightColor(tooltip.bgColor) ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.3)"}`,
              whiteSpace: "nowrap",
              zIndex: 10,
              fontFamily: FONT,
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ opacity: 0.85, fontSize: "0.75rem" }}>
              Your income: <strong>{tooltip.headLabel}</strong>
            </div>
            <div style={{ opacity: 0.85, fontSize: "0.75rem" }}>
              {"Partner\u2019s income: "}
              <strong>{tooltip.spouseLabel}</strong>
            </div>

            {tooltip.notMarried !== undefined && (
              <>
                <div
                  style={{
                    height: 1,
                    background: isLightColor(tooltip.bgColor) ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.25)",
                    margin: "4px 0",
                  }}
                />
                <div>
                  Not married: {fmtDollar(tooltip.notMarried, currencySymbol)}
                </div>
                <div>
                  Married: {fmtDollar(tooltip.married, currencySymbol)}
                </div>
              </>
            )}
            <div
              style={{
                fontWeight: 700,
                fontSize: "0.9rem",
                marginTop: 2,
              }}
            >
              {tooltip.delta >= 0 ? "Bonus" : "Penalty"}:{" "}
              {fmtDollar(Math.abs(tooltip.delta), currencySymbol)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
