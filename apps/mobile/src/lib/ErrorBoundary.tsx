import { Component, type ReactNode, type ErrorInfo } from 'react';
import { DevSettings, Platform } from 'react-native';
import { CrashScreen } from '@/features/system/CrashScreen';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, info);
  }

  private handleRestart = (): void => {
    if (__DEV__) {
      DevSettings.reload();
      return;
    }
    // Production: there's no built-in restart; the user must force-quit + reopen.
    // Reset boundary state so the user sees the previous screen again if rendering recovers.
    this.setState({ error: null });
  };

  private handleReport = (): void => {
    // Future: pipe to a real telemetry sink (Sentry, etc.).
    // For now, log structured payload for offline triage.
    console.warn('[crash-report]', JSON.stringify({
      platform: Platform.OS,
      message: this.state.error?.message,
      stack: this.state.error?.stack,
    }));
  };

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <CrashScreen
          error={this.state.error}
          onRestart={this.handleRestart}
          onSendReport={this.handleReport}
        />
      );
    }
    return this.props.children;
  }
}
