"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/business";
import type { Entry } from "@/lib/types";

export function EntryRow({
  entry,
  carTypes,
  serviceTypes,
  editing,
  onEdit,
  onCancel,
  onSave,
  onDelete,
}: {
  entry: Entry;
  carTypes: string[];
  serviceTypes: string[];
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (patch: Partial<Entry>) => void;
  onDelete: () => void;
}) {
  const [carType, setCarType] = useState(entry.car_type);
  const [serviceType, setServiceType] = useState(entry.service_type);
  const [cash, setCash] = useState(String(entry.cash_paid));
  const [card, setCard] = useState(String(entry.card_paid));
  const [notes, setNotes] = useState(entry.notes || "");

  const time = new Date(entry.occurred_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

  if (entry.pending) {
    return (
      <tr style={{ opacity: 0.65 }}>
        <td>{time}</td>
        <td>{entry.car_type}</td>
        <td>{entry.service_type}</td>
        <td>{entry.payment_method}</td>
        <td className="txt-cash">{formatCurrency(entry.cash_paid)}</td>
        <td className="txt-card">{formatCurrency(entry.card_paid)}</td>
        <td className="font-extrabold">{formatCurrency(entry.gross)}</td>
        <td className="txt-warning font-bold text-sm">⏳ بانتظار الرفع</td>
      </tr>
    );
  }

  if (!editing) {
    return (
      <tr>
        <td>{time}</td>
        <td>{entry.car_type}</td>
        <td>{entry.service_type}</td>
        <td>{entry.payment_method}</td>
        <td className="txt-cash">{formatCurrency(entry.cash_paid)}</td>
        <td className="txt-card">{formatCurrency(entry.card_paid)}</td>
        <td className="font-extrabold">{formatCurrency(entry.gross)}</td>
        <td className="flex gap-1.5">
          <button type="button" className="action-button edit-button" onClick={onEdit}>تعديل</button>
          <button type="button" className="action-button delete-button" onClick={onDelete}>حذف</button>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={8}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 py-2">
          <div>
            <label className="form-label">نوع السيارة</label>
            <select value={carType} onChange={(e) => setCarType(e.target.value)}>
              {carTypes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">نوع الخدمة</label>
            <select value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
              {serviceTypes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">كاش</label>
            <input type="number" step="0.01" min="0" value={cash} onChange={(e) => setCash(e.target.value)} />
          </div>
          <div>
            <label className="form-label">بطاقة</label>
            <input type="number" step="0.01" min="0" value={card} onChange={(e) => setCard(e.target.value)} />
          </div>
          <div>
            <label className="form-label">ملاحظات</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pb-2">
          <button type="button" className="btn-primary" onClick={() => onSave({ car_type: carType, service_type: serviceType, cash_paid: Number(cash) || 0, card_paid: Number(card) || 0, notes })}>حفظ</button>
          <button type="button" className="btn-secondary" onClick={onCancel}>إلغاء</button>
        </div>
      </td>
    </tr>
  );
}
