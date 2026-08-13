"use client";

import { formatCurrency } from "@/lib/business";
import type { BreakEven } from "@/lib/breakeven";

export function BreakEvenMeter({
  goal,
  carsToday,
  revenueToday,
  ownerView,
}: {
  goal: BreakEven;
  carsToday: number;
  revenueToday: number;
  ownerView: boolean;
}) {
  if (goal.carsNeeded <= 0) return null;

  const met = carsToday >= goal.carsNeeded;
  const pct = Math.min(100, (carsToday / goal.carsNeeded) * 100);
  const remaining = Math.max(0, goal.carsNeeded - carsToday);

  return (
    <section className="card goal-card">
      <div className="goal-head">
        <span className="goal-title">هدف اليوم</span>
        <span className={`goal-count ${met ? "txt-cash" : "txt-warning"}`}>
          {carsToday} / {goal.carsNeeded} سيارة
        </span>
      </div>

      <div className="goal-track">
        <div className={`goal-fill ${met ? "is-met" : ""}`} style={{ width: `${pct}%` }} />
      </div>

      {ownerView ? (
        <p className="goal-note">
          {met
            ? `تجاوزت التعادل — الفائض ${formatCurrency(revenueToday - goal.dailyExpense)}`
            : `باقي ${remaining} سيارة لتغطية مصروف اليوم (${formatCurrency(goal.dailyExpense)}).`}
          {" "}متوسط الفاتورة {formatCurrency(goal.avgTicket)}.
        </p>
      ) : (
        <p className="goal-note">
          {met ? "أنجزتوا هدف اليوم 👏" : `باقي ${remaining} سيارة على هدف اليوم.`}
        </p>
      )}
    </section>
  );
}
