"use client";

import { Component, type ReactNode } from "react";
import { logError } from "@/lib/errorLog";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    logError(error.message, error.stack, { componentStack: info.componentStack });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card text-center m-4">
          <p className="text-red-600 font-bold mb-3">صار خطأ غير متوقع بالصفحة.</p>
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
            إعادة تحميل الصفحة
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
