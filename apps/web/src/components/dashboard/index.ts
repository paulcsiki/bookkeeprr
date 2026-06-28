/**
 * Reusable, presentational chart/UI primitives for the Dashboard + Profile
 * pages. Token-only styling, hand-rolled SVG (no chart library). The pages that
 * consume these are wired up in later tasks.
 */

export { Donut } from './Donut';
export { TrendLine } from './TrendLine';
export { BarWeek } from './BarWeek';
export { ProgressRing } from './ProgressRing';
export { StatTile } from './StatTile';
export { Segmented, type SegmentedOption } from './Segmented';
export { Heatmap } from './Heatmap';
export { Card, CardHead, SectionHead } from './Card';
export { MiniBook, type MiniBookItem } from './MiniBook';

export { fmtMins, fmtHrs, compactNum, fmtDelta, type FormattedMins } from './format';
export {
  WIDGET_META,
  DEFAULT_ORDER,
  PERIOD_NOTE,
  relativeTime,
  packRows,
  rowColumns,
  greetingFromHour,
  firstNameOf,
  periodFromQuery,
  type WidgetId,
  type WidgetSpan,
  type WidgetRow,
} from './page-layout';
export {
  WIDGET_IDS,
  WIDGET_ICON,
  SOCIAL_ORDER,
  isWidgetId,
  defaultPrefs,
  mergePrefs,
  validatePrefs,
  type DashboardPrefs,
  type ValidateResult,
} from './widget-registry';
export {
  donutGeometry,
  heatmapLevel,
  trendGeometry,
  ringProgress,
  buildHeatmapGrid,
  type DonutSegment,
  type DonutArc,
  type DonutGeometry,
  type TrendPoint,
  type TrendGeometry,
  type HeatmapDay,
  type HeatmapCell,
} from './chart-math';
