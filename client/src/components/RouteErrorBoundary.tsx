import { Component, type ErrorInfo, type ReactNode } from 'react';

type RouteErrorBoundaryProps = {
  routeName: string;
  children: ReactNode;
};

type RouteErrorBoundaryState = {
  hasError: boolean;
  errorMessage: string;
};

export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  static getDerivedStateFromError(error: unknown): RouteErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : 'Unknown route render error',
    };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo): void {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error(`[route-error:${this.props.routeName}]`, error, errorInfo);
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (!import.meta.env.DEV) {
      return null;
    }

    return (
      <div className="mx-auto mt-6 max-w-3xl rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700">
        <p className="text-sm font-semibold">
          Route failed to render: {this.props.routeName}
        </p>
        <p className="mt-1 text-sm">{this.state.errorMessage}</p>
      </div>
    );
  }
}

