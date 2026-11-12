/**
 * Rate hierarchy:
 *   1. Global default rate → copied onto each NEW client when it is created.
 *   2. Client rate         → used by the client's projects without an override.
 *   3. Project override    → highest priority.
 * The effective rate is captured on each time entry when it is saved, so later
 * rate changes never alter saved entries or past reports.
 */
export type RateSource = "project" | "client";

export function effectiveRate(clientRateCents: number, projectRateCents: number | null | undefined): {
  rateCents: number;
  source: RateSource;
} {
  if (projectRateCents !== null && projectRateCents !== undefined) {
    return { rateCents: projectRateCents, source: "project" };
  }
  return { rateCents: clientRateCents, source: "client" };
}
