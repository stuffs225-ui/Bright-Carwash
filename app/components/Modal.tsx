"use client";

import { useEffect,useId,useRef } from "react";

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const titleId=useId();
  const dialogRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
   const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
   dialogRef.current?.focus();
   return()=>previous?.focus();
  },[]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal show"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className="modal-content">
        <button type="button" className="close-button" onClick={onClose} aria-label="إغلاق">&times;</button>
        <h2 id={titleId} className="text-xl font-extrabold txt-strong mb-5 text-center">{title}</h2>
        {children}
      </div>
    </div>
  );
}
