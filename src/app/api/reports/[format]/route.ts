import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedRequest } from "@/server/auth";
import { getReportData, parseReportFilters } from "@/server/reports";
import { getSettings } from "@/server/settings";
import { buildCsv } from "@/server/export/csv";
import { buildXlsx } from "@/server/export/xlsx";
import { buildPdf } from "@/server/export/pdf";
import { contentDisposition } from "@/lib/filename";

export const dynamic = "force-dynamic";

const TYPES = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
} as const;

export async function GET(request: NextRequest, { params }: { params: Promise<{ format: string }> }) {
  if (!(await isAuthorizedRequest())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { format } = await params;
  if (!(format in TYPES)) return NextResponse.json({ error: "Unknown format" }, { status: 404 });
  const ext = format as keyof typeof TYPES;

  const settings = getSettings();
  const data = getReportData(parseReportFilters(request.nextUrl.searchParams));
  const body: string | Buffer = ext === "csv" ? buildCsv(data) : ext === "xlsx" ? await buildXlsx(data, settings) : await buildPdf(data, settings);

  return new NextResponse(typeof body === "string" ? body : new Uint8Array(body), {
    headers: {
      "Content-Type": TYPES[ext],
      "Content-Disposition": contentDisposition(data.filenameBase(ext)),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
