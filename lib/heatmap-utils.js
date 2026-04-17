/**
 * Pure utility functions for the SVG heatmap.
 * Extracted for testability and reuse.
 */

export const TEAL_SCALE = [
  [0, "#1F2937"],
  [0.3, "#6B7280"],
  [0.45, "#D1D5DB"],
  [0.5, "#D1D5DB"],
  [0.55, "#D1D5DB"],
  [0.65, "#81E6D9"],
  [1, "#0D9488"],
];

export const VALENTINE_SCALE = [
  [0, "#1F2937"],
  [0.3, "#6B7280"],
  [0.45, "#D1D5DB"],
  [0.5, "#D1D5DB"],
  [0.55, "#D1D5DB"],
  [0.65, "#F9A8D4"],
  [1, "#BE185D"],
];

/**
 * Interpolate a color from a colorscale given a normalized value [0, 1].
 */
export function interpolateColor(scale, t) {
  t = Math.max(0, Math.min(1, t));
  let lower = scale[0],
    upper = scale[scale.length - 1];
  for (let i = 0; i < scale.length - 1; i++) {
    if (t >= scale[i][0] && t <= scale[i + 1][0]) {
      lower = scale[i];
      upper = scale[i + 1];
      break;
    }
  }
  const range = upper[0] - lower[0];
  const frac = range > 0 ? (t - lower[0]) / range : 0;
  const parse = (hex) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = parse(lower[1]);
  const [r2, g2, b2] = parse(upper[1]);
  const r = Math.round(r1 + frac * (r2 - r1));
  const g = Math.round(g1 + frac * (g2 - g1));
  const b = Math.round(b1 + frac * (b2 - b1));
  return `rgb(${r},${g},${b})`;
}

/**
 * Format a currency value: $1,234 or -$1,234 (symbol defaults to "$")
 */
export function fmtDollar(v, symbol = "$") {
  const r = Math.round(v);
  const abs = Math.abs(r);
  const formatted = abs.toLocaleString("en-US");
  return r < 0 ? `-${symbol}${formatted}` : `${symbol}${formatted}`;
}

/**
 * Return true if a CSS rgb() color is light enough to need dark text.
 */
export function isLightColor(rgb) {
  const m = rgb.match(/\d+/g);
  if (!m) return false;
  const [r, g, b] = m.map(Number);
  // Relative luminance (sRGB)
  const L = 0.299 * r + 0.587 * g + 0.114 * b;
  return L > 160;
}

/**
 * Short currency format for color bar ticks: $10k, -$5k, $500
 */
export function fmtShortDollar(v, symbol = "$") {
  const r = Math.round(v);
  const abs = Math.abs(r);
  const sign = r < 0 ? "-" : "";
  if (abs >= 1000) return `${sign}${symbol}${Math.round(abs / 1000)}k`;
  return `${sign}${symbol}${abs}`;
}
