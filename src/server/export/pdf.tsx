import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import type { Settings } from "@/db/schema";
import { formatCents } from "@/lib/money";
import { formatDuration, formatTimeSpan } from "@/lib/duration";
import { formatDateShort, formatRange } from "@/lib/dates";
import { groupByProject } from "@/lib/report";
import type { ReportData } from "../reports";

/*
 * Note: react-pdf drops `render`-prop text (page numbers, the continuation
 * header) when a lineHeight is inherited from the page, so line height is set
 * only on table cells and contact lines.
 */

/**
 * A plain, letterhead-style black-and-white report in Helvetica (a PDF
 * standard font, so nothing is downloaded or embedded).
 */
const BLACK = "#000000";
const GREY = "#444444";
const LINE = "#D4D4D4";

const s = StyleSheet.create({
  page: { paddingTop: 54, paddingBottom: 64, paddingHorizontal: 54, fontFamily: "Helvetica", fontSize: 9.5, color: BLACK },
  letterhead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 10, borderBottomWidth: 0.75, borderBottomColor: BLACK },
  name: { fontFamily: "Helvetica-Bold", fontSize: 16 },
  contact: { fontSize: 8.5, color: GREY, textAlign: "right", lineHeight: 1.45 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 28, marginBottom: 24 },
  title: { fontFamily: "Helvetica-Bold", fontSize: 20, lineHeight: 1.2, marginBottom: 4 },
  meta: { flexDirection: "row", gap: 10, fontSize: 9 },
  metaLabel: { color: GREY, width: 70 },
  metaValue: { textAlign: "right", minWidth: 110 },
  th: { flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: BLACK, paddingBottom: 5, fontFamily: "Helvetica-Bold", fontSize: 7.5, letterSpacing: 0.6, textTransform: "uppercase" },
  row: { flexDirection: "row", paddingVertical: 5.5, borderBottomWidth: 0.5, borderBottomColor: LINE },
  group: { fontFamily: "Helvetica-Bold", fontSize: 9.5, paddingTop: 12, paddingBottom: 3 },
  subtotal: { flexDirection: "row", paddingVertical: 6, fontSize: 9 },
  totals: { marginTop: 18, marginLeft: "auto", width: 250 },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.5, fontSize: 9, color: GREY },
  totalBox: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 6, paddingVertical: 8, borderTopWidth: 2, borderTopColor: BLACK, borderBottomWidth: 0.75, borderBottomColor: BLACK },
  footerRule: { position: "absolute", left: 54, right: 54, bottom: 44, borderTopWidth: 0.5, borderTopColor: LINE },
  footerText: { position: "absolute", left: 54, right: 150, bottom: 30, fontSize: 8, color: GREY },
  pageNumber: { position: "absolute", left: 360, right: 54, bottom: 30, fontSize: 8, color: GREY, textAlign: "right" },
  continued: { flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: GREY, marginBottom: 12 },
});

type Col = { key: string; label: string; width: number | string; align?: "right" };

export async function buildPdf(data: ReportData, st: Settings): Promise<Buffer> {
  const { report, filters, clientName } = data;
  const multiClient = clientName === null && report.clientCount > 1;
  const period = formatRange(filters.from, filters.to, st.dateFormat);
  const cols: Col[] = [
    { key: "date", label: "Date", width: 44 },
    { key: "desc", label: "Description", width: "auto" },
    ...(filters.showTimes ? [{ key: "worked", label: "Worked", width: 88 } as Col] : []),
    { key: "time", label: "Time", width: 46, align: "right" as const },
    { key: "rate", label: "Rate", width: 52, align: "right" as const },
    { key: "amount", label: "Amount", width: 62, align: "right" as const },
  ];
  const cell = (c: Col): Style => ({
    ...(c.width === "auto" ? { flexGrow: 1, flexShrink: 1, flexBasis: 0, paddingRight: 10 } : { width: c.width as number, paddingLeft: c.key === "date" ? 0 : 6 }),
    textAlign: c.align ?? "left",
    lineHeight: "12.5pt",
  });
  const contactLines = [st.address, [st.phone, st.email].filter(Boolean).join("  ·  "), st.website].filter(Boolean);
  const groups = groupByProject(report);
  const showGroups = groups.length > 1 || multiClient;

  const header = (
    <View style={s.th}>
      {cols.map((c) => (
        <Text key={c.key} style={cell(c)}>
          {c.label}
        </Text>
      ))}
    </View>
  );

  const doc = (
    <Document title={`Time Report — ${clientName ?? "All clients"} — ${period}`} author={st.businessName || undefined} creator="Ledger" producer="Ledger">
      <Page size="LETTER" style={s.page}>
        {/* Continuation header on pages after the first. */}
        <View
          fixed
          render={({ pageNumber }) =>
            pageNumber > 1 ? (
              <View>
                <View style={s.continued}>
                  <Text>
                    Time Report · {clientName ?? "All clients"} · {period}
                  </Text>
                  <Text>{st.businessName}</Text>
                </View>
                {header}
              </View>
            ) : null
          }
        />

        <View style={s.letterhead}>
          <Text style={s.name}>{st.businessName || " "}</Text>
          <View>
            {contactLines.map((l) => (
              <Text key={l} style={s.contact}>
                {l}
              </Text>
            ))}
          </View>
        </View>

        <View style={s.titleRow}>
          <View>
            <Text style={s.title}>Time Report</Text>
            <Text>Prepared for {clientName ?? "All clients"}</Text>
          </View>
          <View>
            <View style={s.meta}>
              <Text style={s.metaLabel}>Period</Text>
              <Text style={s.metaValue}>{period}</Text>
            </View>
            <View style={s.meta}>
              <Text style={s.metaLabel}>Total hours</Text>
              <Text style={s.metaValue}>{formatDuration(report.totalMinutes)}</Text>
            </View>
            <View style={s.meta}>
              <Text style={s.metaLabel}>Total billable</Text>
              <Text style={[s.metaValue, { fontFamily: "Helvetica-Bold" }]}>{formatCents(report.totalCents)}</Text>
            </View>
          </View>
        </View>

        {header}
        {report.entries.length === 0 ? <Text style={{ paddingVertical: 14, color: GREY }}>No time was recorded for this period.</Text> : null}

        {groups.map(({ project, entries }) => (
          <View key={project.projectId}>
            {entries.map((e, i) => (
              // The project heading travels with its first row so it is never stranded at a page bottom.
              <View key={e.id} wrap={false}>
                {showGroups && i === 0 ? (
                  <Text style={s.group}>{multiClient ? `${project.clientName} · ${project.projectName}` : project.projectName}</Text>
                ) : null}
                <View style={s.row}>
                <Text style={cell(cols[0])}>{formatDateShort(e.date, st.dateFormat)}</Text>
                <Text style={cell(cols[1])}>{e.description}</Text>
                {filters.showTimes ? <Text style={cell(cols[2])}>{formatTimeSpan(e.startTime, e.endTime, st.timeFormat) || "—"}</Text> : null}
                <Text style={cell(cols[cols.length - 3])}>{formatDuration(e.minutes)}</Text>
                <Text style={cell(cols[cols.length - 2])}>{formatCents(e.rateCents)}</Text>
                <Text style={cell(cols[cols.length - 1])}>{formatCents(e.amountCents)}</Text>
                </View>
              </View>
            ))}
            {showGroups ? (
              <View style={s.subtotal} wrap={false}>
                <Text style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, textAlign: "right", paddingRight: 6 }}>Subtotal, {project.projectName}</Text>
                <Text style={cell(cols[cols.length - 3])}>{formatDuration(project.minutes)}</Text>
                <Text style={cell(cols[cols.length - 2])}> </Text>
                <Text style={[cell(cols[cols.length - 1]), { fontFamily: "Helvetica-Bold" }]}>{formatCents(project.amountCents)}</Text>
              </View>
            ) : null}
          </View>
        ))}

        <View style={s.totals} wrap={false}>
          {showGroups
            ? groups.map(({ project }) => (
                <View key={project.projectId} style={s.breakdownRow}>
                  <Text>{multiClient ? `${project.clientName} · ${project.projectName}` : project.projectName}</Text>
                  <Text>{formatCents(project.amountCents)}</Text>
                </View>
              ))
            : null}
          <View style={s.totalBox}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10 }}>Total · {formatDuration(report.totalMinutes)}</Text>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 15 }}>{formatCents(report.totalCents)}</Text>
          </View>
        </View>

        <View style={s.footerRule} fixed />
        <Text style={s.footerText} fixed>
          {st.reportFooter || " "}
        </Text>
        <Text style={s.pageNumber} fixed render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
