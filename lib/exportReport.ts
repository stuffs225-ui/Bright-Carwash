import type { Diagnostics } from "./diagnostics";

export type ReportDay = {
  date: string;
  cars: number;
  cash: number;
  card: number;
  revenue: number;
  expenses: number;
  net: number;
};

export type ReportBreakdown = { label: string; value: number; count?: number };

export type ReportInput = {
  startDate: string;
  endDate: string;
  daily: ReportDay[];
  carTypes: ReportBreakdown[];
  serviceTypes: ReportBreakdown[];
  expenseTypes: ReportBreakdown[];
  metrics: {
    cars: number;
    revenue: number;
    cash: number;
    card: number;
    expenses: number;
    net: number;
    avgTicket: number;
  };
  diagnostics: Diagnostics;
};

const n = (v: number) => Number(v).toFixed(2);

// xlsx يُحمّل ديناميكياً فقط عند الحاجة الفعلية، عشان ما يثقل حجم الصفحة الأولي
export async function exportReportToExcel(filename: string, r: ReportInput) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      {
        "من تاريخ": r.startDate,
        "إلى تاريخ": r.endDate,
        "عدد السيارات": r.metrics.cars,
        الإيرادات: r.metrics.revenue,
        كاش: r.metrics.cash,
        بطاقة: r.metrics.card,
        المصروفات: r.metrics.expenses,
        "صافي الدخل": r.metrics.net,
        "متوسط الفاتورة": r.metrics.avgTicket,
      },
    ]),
    "الملخص"
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      r.daily.map((d) => ({
        التاريخ: d.date,
        السيارات: d.cars,
        كاش: d.cash,
        بطاقة: d.card,
        الإيراد: d.revenue,
        المصروفات: d.expenses,
        الصافي: d.net,
      }))
    ),
    "التفاصيل اليومية"
  );

  const diag = r.diagnostics;
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      ...diag.expenseWithoutIncome.map((d) => ({ الفحص: "مصروف بدون دخل", التاريخ: d.date, التفصيل: `مصروف ${n(d.expenses)}` })),
      ...diag.silentDays.map((d) => ({ الفحص: "يوم بدون أي تسجيل", التاريخ: d, التفصيل: "" })),
      ...diag.priceOutliers.map((o) => ({
        الفحص: "سعر شاذ",
        التاريخ: o.date,
        التفصيل: `${o.carType} · ${o.serviceType}: ${n(o.amount)} بدل ${n(o.usual)}`,
      })),
      ...diag.batches.map((b) => ({ الفحص: "تسجيل دفعات", التاريخ: b.minute, التفصيل: `${b.count} عمليات بنفس الدقيقة` })),
    ]),
    "التشخيص"
  );

  XLSX.writeFile(wb, `${filename}.xlsx`);
}

function mdTable(headers: string[], rows: (string | number)[][]): string {
  if (!rows.length) return "_لا توجد بيانات._\n";
  return [
    `| ${headers.join(" | ")} |`,
    `|${headers.map(() => "---").join("|")}|`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n") + "\n";
}

export function buildReportMarkdown(r: ReportInput): string {
  const d = r.diagnostics;
  const out: string[] = [];

  out.push(`# تقرير مغسلة سيارتك اللامعة`);
  out.push(`**الفترة:** ${r.startDate} — ${r.endDate}\n`);

  out.push(`## الملخص\n`);
  out.push(
    mdTable(
      ["المؤشر", "القيمة"],
      [
        ["عدد السيارات", r.metrics.cars],
        ["الإيرادات", n(r.metrics.revenue)],
        ["كاش", n(r.metrics.cash)],
        ["بطاقة", n(r.metrics.card)],
        ["المصروفات", n(r.metrics.expenses)],
        ["صافي الدخل", n(r.metrics.net)],
        ["متوسط الفاتورة", n(r.metrics.avgTicket)],
        ["أيام فيها تسجيل", d.totals.days],
      ]
    )
  );

  out.push(`## التفاصيل اليومية\n`);
  out.push(
    mdTable(
      ["التاريخ", "السيارات", "كاش", "بطاقة", "الإيراد", "المصروفات", "الصافي"],
      r.daily.map((x) => [x.date, x.cars, n(x.cash), n(x.card), n(x.revenue), n(x.expenses), n(x.net)])
    )
  );

  const breakdown = (title: string, rows: ReportBreakdown[]) => {
    out.push(`## ${title}\n`);
    out.push(mdTable(["البند", "القيمة", "العدد"], rows.map((x) => [x.label, n(x.value), x.count ?? "—"])));
  };
  breakdown("حسب نوع السيارة", r.carTypes);
  breakdown("حسب نوع الخدمة", r.serviceTypes);
  breakdown("حسب نوع المصروف", r.expenseTypes);

  out.push(`## التشخيص التلقائي\n`);

  out.push(`### أيام فيها مصروف بدون أي دخل (${d.expenseWithoutIncome.length})\n`);
  out.push(
    mdTable(
      ["التاريخ", "المصروف"],
      d.expenseWithoutIncome.map((x) => [x.date, n(x.expenses)])
    )
  );

  out.push(`### أيام بدون أي تسجيل إطلاقاً (${d.silentDays.length})\n`);
  out.push(d.silentDays.length ? d.silentDays.join("، ") + "\n" : "_لا يوجد._\n");

  out.push(`### أسعار شاذة (${d.priceOutliers.length})\n`);
  out.push(
    mdTable(
      ["التاريخ", "السيارة", "الخدمة", "المبلغ", "المعتاد"],
      d.priceOutliers.slice(0, 50).map((o) => [o.date, o.carType, o.serviceType, n(o.amount), n(o.usual)])
    )
  );

  out.push(`### تسجيل دفعات — 3 عمليات أو أكثر بنفس الدقيقة (${d.batches.length})\n`);
  out.push(
    mdTable(
      ["الدقيقة", "عدد العمليات"],
      d.batches.slice(0, 30).map((b) => [b.minute, b.count])
    )
  );

  out.push(`### أيام فيها دخل بدون أي مصروف (${d.incomeWithoutExpense.length})\n`);
  out.push(`_للسياق فقط — طبيعي ألا تُصرف مصاريف كل يوم._\n`);

  return out.join("\n");
}

export function downloadMarkdown(filename: string, markdown: string) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
