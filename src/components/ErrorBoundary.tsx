import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = error.message || 'An unexpected application error occurred.';
    try {
      const parsed = JSON.parse(readable) as { error?: string; operationType?: string; path?: string };
      if (parsed && parsed.error) {
        readable = `Database security check (${parsed.operationType || 'access'} ${
          parsed.path || ''
        }): ${parsed.error}`;
      }
    } catch {
      // Not a JSON FirestoreErrorInfo payload
    }
    return { hasError: true, message: readable };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Application ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0A0E17] text-slate-100 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#131A29] border border-rose-500/35 p-6 space-y-4 text-center shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 text-rose-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h1 className="font-display text-lg font-extrabold text-white">
              Something went wrong
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="ff-btn-ember min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-extrabold inline-flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reload App</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
