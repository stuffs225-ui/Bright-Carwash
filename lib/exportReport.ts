// xlsx يُحمّل ديناميكياً فقط عند الحاجة الفعلية للتصدير، عشان ما يثقل حجم الصفحة الأولي
export async function exportDailyReportToExcel(
  filename: string,
  summary: Record<string, string | number>,
  dailyRows: { date: string; cars: number; cash: number; card: number; revenue: number; expenses: number; net: number }[]
) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.json_to_sheet([summary]);
  XLSX.utils.book_append_sheet(wb, summarySheet, "الملخص");

  const dailySheet = XLSX.utils.json_to_sheet(
    dailyRows.map((r) => ({
      التاريخ: r.date,
      السيارات: r.cars,
      كاش: r.cash,
      بطاقة: r.card,
      الإيراد: r.revenue,
      المصروفات: r.expenses,
      الصافي: r.net,
    }))
  );
  XLSX.utils.book_append_sheet(wb, dailySheet, "التفاصيل اليومية");

  XLSX.writeFile(wb, `${filename}.xlsx`);
}
