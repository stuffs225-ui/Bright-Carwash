export type ToastType = "success" | "error" | "warning" | "info";

export function showToast(message: string, type: ToastType = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toast.style.backgroundColor =
    type === "error" ? "#dc2626" : type === "warning" ? "#d97706" : type === "info" ? "#2563eb" : "#059669";
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}
