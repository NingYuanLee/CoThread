import { Component, type ErrorInfo, type ReactNode } from "react";
import { BootScreen } from "./BootScreen";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error", { error, componentStack: info.componentStack });
  }

  private handleRetry = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return <BootScreen error="页面加载失败，请重试。" onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}
