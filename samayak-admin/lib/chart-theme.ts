/** Recharts / inline chart styling — uses theme tokens only (no ad-hoc hex). */
export const chartTheme = {
  grid: "var(--color-border)",
  axis: "var(--color-border)",
  tick: "var(--color-text-secondary)",
  brand: "var(--color-brand-secondary)",
  warning: "var(--color-warning)",
  barPalette: [
    "var(--color-brand-primary)",
    "var(--color-brand-secondary)",
    "var(--color-success)",
    "var(--color-warning)",
    "var(--color-danger)",
    "var(--color-info)",
    "var(--color-brand-primary-light)",
    "var(--color-text-muted)",
  ],
  tooltip: {
    borderRadius: "10px",
    border: "1px solid var(--color-border)",
    fontSize: "12px",
    fontFamily: "'Figtree', sans-serif",
  },
} as const;
