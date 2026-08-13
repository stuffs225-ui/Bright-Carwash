"use client";

import { useState } from "react";
import { Modal } from "./Modal";

export function OwnerPinPrompt({
  expectedPin,
  onUnlock,
  onCancel,
}: {
  expectedPin: string;
  onUnlock: () => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");
  const [wrong, setWrong] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pin === expectedPin) {
      onUnlock();
      return;
    }
    setWrong(true);
    setPin("");
  }

  return (
    <Modal title="وضع المالك" onClose={onCancel}>
      <form onSubmit={submit} className="space-y-4" style={{ maxWidth: 320, margin: "0 auto" }}>
        <div>
          <label className="form-label">الرقم السري</label>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={pin}
            onChange={(e) => { setPin(e.target.value); setWrong(false); }}
          />
        </div>
        {wrong && <p className="txt-danger font-bold text-center">رقم غير صحيح.</p>}
        <button type="submit" className="btn-primary w-full">دخول</button>
      </form>
    </Modal>
  );
}
