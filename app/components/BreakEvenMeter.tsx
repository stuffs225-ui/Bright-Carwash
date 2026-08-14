"use client";

import { formatCurrency } from "@/lib/business";
import { t, type Lang } from "@/lib/i18n";
import type { BreakEven } from "@/lib/breakeven";

export function BreakEvenMeter({
  goal,
  carsToday,
  revenueToday,
  ownerView,
  lang = "ar",
}: {
  goal: BreakEven;
  carsToday: number;
  revenueToday: number;
  ownerView: boolean;
  lang?: Lang;
}) {
  if (goal.carsNeeded <= 0) return null;

  const tt = (text: string, vars?: Record<string, string | number>) => t(lang, text, vars);
  const met = carsToday >= goal.carsNeeded;
  const pct = Math.min(100, (carsToday / goal.carsNeeded) * 100);
  const remaining = Math.max(0, goal.carsNeeded - carsToday);

  return (
    <section className="card goal-card">
      <div className="goal-head">
        <span className="goal-title">{tt("هدف اليوم")}</span>
        <span className={`goal-count ${met ? "txt-cash" : "txt-warning"}`}>
          {tt("{a} / {b} سيارة", { a: carsToday, b: goal.carsNeeded })}
        </span>
      </div>

      <div className="goal-track">
        <div className={`goal-fill ${met ? "is-met" : ""}`} style={{ width: `${pct}%` }} />
      </div>

      {ownerView ? (
        <p className="goal-note">
          {met
            ? tt("تجاوزت التعادل — الفائض {amt}", { amt: formatCurrency(revenueToday - goal.dailyExpense) })
            : tt("باقي {n} سيارة لتغطية مصروف اليوم ({amt}).", { n: remaining, amt: formatCurrency(goal.dailyExpense) })}
          {tt(" متوسط الفاتورة {amt}.", { amt: formatCurrency(goal.avgTicket) })}
        </p>
      ) : (
        <p className="goal-note">
          {met ? tt("أنجزتوا هدف اليوم 👏") : tt("باقي {n} سيارة على هدف اليوم.", { n: remaining })}
        </p>
      )}
    </section>
  );
}
