import { useCallback, useEffect, useState } from 'react';
import { Logo } from './Logo';
import type { AgentHarness, CursorAuthStatus } from '../../types';

interface SettingsScreenProps {
  harness: AgentHarness;
  onHarnessChange: (harness: AgentHarness) => Promise<void>;
  onClose: () => void;
}

export function SettingsScreen({ harness, onHarnessChange, onClose }: SettingsScreenProps) {
  const [cursorStatus, setCursorStatus] = useState<CursorAuthStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginMessage, setLoginMessage] = useState<string | null>(null);

  const refreshCursorStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const status = await window.agent.cursorAuthStatus();
      setCursorStatus(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCursorStatus({
        cliAvailable: false,
        authenticated: false,
        account: null,
        detail: null,
        error: message,
      });
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (harness !== 'cursor') return;
    refreshCursorStatus();
  }, [harness, refreshCursorStatus]);

  const handleHarnessChange = useCallback(async (nextHarness: AgentHarness) => {
    setLoginMessage(null);
    await onHarnessChange(nextHarness);
  }, [onHarnessChange]);

  const handleCursorLogin = useCallback(async () => {
    setLoginMessage(null);
    setLoginLoading(true);
    try {
      const result = await window.agent.cursorLogin();
      if (!result.started) {
        setLoginMessage(result.error || 'Could not start Cursor login.');
        return;
      }

      setLoginMessage('Cursor login started. Complete authentication in your browser, then refresh status.');
      setTimeout(() => {
        refreshCursorStatus().catch(() => {});
      }, 1500);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLoginMessage(message);
    } finally {
      setLoginLoading(false);
    }
  }, [refreshCursorStatus]);

  return (
    <div className="h-full bg-[#1a2332] text-gray-100 overflow-auto">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="flex flex-col items-center gap-4">
          <Logo />
          <h2 className="text-xl font-medium text-gray-100">Settings</h2>
        </div>

        <section className="mt-8 rounded-xl border border-[#2a3142] bg-[#151b26] p-5">
          <h3 className="text-sm font-semibold text-gray-200">Agent Harness</h3>
          <p className="mt-1 text-xs text-gray-400">
            Baby SWE runs as an ACP client. Choose which ACP harness to use.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <HarnessOption
              title="Cursor"
              subtitle="Use your Cursor CLI session and model access."
              selected={harness === 'cursor'}
              onClick={() => handleHarnessChange('cursor')}
            />
            <HarnessOption
              title="Deepagents"
              subtitle="Use deepagents ACP with your configured API keys."
              selected={harness === 'deepagents'}
              onClick={() => handleHarnessChange('deepagents')}
            />
          </div>
        </section>

        <section className="mt-5 rounded-xl border border-[#2a3142] bg-[#151b26] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-200">Cursor Authentication</h3>
              <p className="mt-1 text-xs text-gray-400">
                Required when using the Cursor harness.
              </p>
            </div>
            <button
              type="button"
              onClick={() => refreshCursorStatus()}
              disabled={statusLoading}
              className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-100 rounded-md transition-colors"
            >
              {statusLoading ? 'Refreshing...' : 'Refresh Status'}
            </button>
          </div>

          <div className="mt-4 rounded-md border border-[#2a3142] bg-[#111827] p-3">
            <div className="flex items-center gap-2 text-sm">
              <StatusDot status={cursorStatus} />
              <span className="text-gray-200">
                {statusLoading
                  ? 'Checking Cursor CLI status...'
                  : formatCursorStatus(cursorStatus)}
              </span>
            </div>
            {cursorStatus?.detail && (
              <p className="mt-2 text-xs text-gray-500 whitespace-pre-wrap">{cursorStatus.detail}</p>
            )}
            {cursorStatus?.error && (
              <p className="mt-2 text-xs text-red-400">{cursorStatus.error}</p>
            )}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={handleCursorLogin}
              disabled={loginLoading}
              className="px-4 py-2 bg-[#5a9bc7] hover:bg-[#6daad3] disabled:opacity-50 text-white rounded-md text-sm font-medium transition-colors"
            >
              {loginLoading ? 'Starting...' : 'Authenticate with Cursor CLI'}
            </button>
            <span className="text-xs text-gray-500">
              This launches `agent login` and opens a browser if needed.
            </span>
          </div>

          {loginMessage && (
            <p className="mt-3 text-xs text-gray-300">{loginMessage}</p>
          )}
        </section>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-100 rounded-md text-sm font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function HarnessOption({ title, subtitle, selected, onClick }: {
  title: string;
  subtitle: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg border px-4 py-3 transition-colors ${
        selected
          ? 'border-[#5a9bc7] bg-[#1e2f44]'
          : 'border-[#2a3142] bg-[#111827] hover:border-gray-500'
      }`}
    >
      <div className="text-sm font-medium text-gray-100">{title}</div>
      <div className="mt-1 text-xs text-gray-400">{subtitle}</div>
    </button>
  );
}

function StatusDot({ status }: { status: CursorAuthStatus | null }) {
  const className = !status
    ? 'bg-gray-500'
    : status.authenticated
      ? 'bg-green-400'
      : status.cliAvailable
        ? 'bg-yellow-400'
        : 'bg-red-400';

  return <span className={`w-2 h-2 rounded-full ${className}`} />;
}

function formatCursorStatus(status: CursorAuthStatus | null): string {
  if (!status) return 'Status unavailable';
  if (!status.cliAvailable) return 'Cursor CLI not available';
  if (status.authenticated && status.account) return `Authenticated as ${status.account}`;
  if (status.authenticated) return 'Authenticated';
  return 'Not authenticated';
}
