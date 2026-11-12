import { formatFilenameDate, type IsoDate } from "./dates";

/**
 * Remove characters that are invalid in filenames on Windows/macOS/Linux while
 * keeping the name readable ("Harbor & Pine Law" stays as-is).
 */
export function sanitizeFilenamePart(name: string): string {
  return name
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
}

/**
 * Client Name_Time_Report_MM.DD.YY_MM.DD.YY_Suffix.ext
 * Dates are the selected reporting range, never the creation date.
 * A null client means an all-clients report.
 */
export function reportFilename(opts: {
  clientName: string | null;
  from: IsoDate;
  to: IsoDate;
  suffix: string;
  ext: "pdf" | "xlsx" | "csv";
}): string {
  const client = opts.clientName === null ? "All_Clients" : sanitizeFilenamePart(opts.clientName) || "Client";
  const suffix = sanitizeFilenamePart(opts.suffix);
  const base = `${client}_Time_Report_${formatFilenameDate(opts.from)}_${formatFilenameDate(opts.to)}`;
  return `${suffix ? `${base}_${suffix}` : base}.${opts.ext}`;
}

/** RFC 6266 Content-Disposition value that survives non-ASCII names. */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
