// RESPONSIVE_STANDARDS.md v1.0.0 — project-owned viewport presets.
export const VIEWPORTS = {
  compact: { width: 412, height: 915 },
  portrait: { width: 835, height: 1194 },
  landscape: { width: 1195, height: 835 },
  desktop: { width: 1440, height: 900 },
  wide: { width: 2560, height: 1440 },
} as const;
export type ViewportAlias = keyof typeof VIEWPORTS;
export function viewportUse(alias: ViewportAlias) {
  const touch = alias === 'compact' || alias === 'portrait' || alias === 'landscape';
  return { viewport: VIEWPORTS[alias], hasTouch: touch };
}
