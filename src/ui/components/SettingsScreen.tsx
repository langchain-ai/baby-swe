import { useCallback, useEffect, useState } from 'react';
import { Logo } from './Logo';
import type { AgentHarness, ApiKeys, CursorAuthStatus, CodexAuthStatus, AcpAdapterStatus, CodexAuthMethod, LinearAuthStatus } from '../../types';

type SettingsTab = 'general' | 'integrations';

const DEEPAGENTS_PACKAGE = 'deepagents-acp';
const CLAUDE_AGENT_PACKAGE = '@zed-industries/claude-agent-acp';
const CODEX_PACKAGE = '@zed-industries/codex-acp';

interface SettingsScreenProps {
  harness: AgentHarness;
  initialKeys?: ApiKeys | null;
  onHarnessChange: (harness: AgentHarness) => Promise<void>;
  onSaveApiKeys: (keys: ApiKeys) => Promise<void>;
  onClose: () => void;
}

export function SettingsScreen({
  harness,
  initialKeys,
  onHarnessChange,
  onSaveApiKeys,
  onClose,
}: SettingsScreenProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [cursorStatus, setCursorStatus] = useState<CursorAuthStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [cursorMessage, setCursorMessage] = useState<string | null>(null);

  const [deepagentsAdapterStatus, setDeepagentsAdapterStatus] = useState<AcpAdapterStatus | null>(null);
  const [claudeAdapterStatus, setClaudeAdapterStatus] = useState<AcpAdapterStatus | null>(null);
  const [codexAdapterStatus, setCodexAdapterStatus] = useState<AcpAdapterStatus | null>(null);

  const [codexAuthStatus, setCodexAuthStatus] = useState<CodexAuthStatus | null>(null);
  const [codexAuthLoading, setCodexAuthLoading] = useState(false);
  const [codexLoginLoading, setCodexLoginLoading] = useState(false);
  const [codexLogoutLoading, setCodexLogoutLoading] = useState(false);
  const [codexMessage, setCodexMessage] = useState<string | null>(null);

  const [anthropic, setAnthropic] = useState(initialKeys?.anthropic || '');
  const [openai, setOpenai] = useState(initialKeys?.openai || '');
  const [baseten, setBaseten] = useState(initialKeys?.baseten || '');
  const [tavily, setTavily] = useState(initialKeys?.tavily || '');
  const [codexAuthMethod, setCodexAuthMethod] = useState<CodexAuthMethod>(initialKeys?.codexAuthMethod || 'api-key');
  const [showAnthropic, setShowAnthropic] = useState(false);
  const [showOpenai, setShowOpenai] = useState(false);
  const [showBaseten, setShowBaseten] = useState(false);
  const [showTavily, setShowTavily] = useState(false);
  const [keysLoading, setKeysLoading] = useState(false);
  const [keysError, setKeysError] = useState<string | null>(null);
  const [keysMessage, setKeysMessage] = useState<string | null>(null);

  const [linearApiKey, setLinearApiKey] = useState(initialKeys?.linearApiKey || '');
  const [showLinearApiKey, setShowLinearApiKey] = useState(false);
  const [linearAuthStatus, setLinearAuthStatus] = useState<LinearAuthStatus | null>(null);
  const [linearAuthLoading, setLinearAuthLoading] = useState(false);
  const [linearMessage, setLinearMessage] = useState<string | null>(null);
  const [linearSaving, setLinearSaving] = useState(false);

  useEffect(() => {
    setAnthropic(initialKeys?.anthropic || '');
    setOpenai(initialKeys?.openai || '');
    setBaseten(initialKeys?.baseten || '');
    setTavily(initialKeys?.tavily || '');
    setCodexAuthMethod(initialKeys?.codexAuthMethod || 'api-key');
    setLinearApiKey(initialKeys?.linearApiKey || '');
  }, [initialKeys]);

  const refreshLinearAuthStatus = useCallback(async () => {
    setLinearAuthLoading(true);
    try {
      const status = await window.linear.authStatus();
      setLinearAuthStatus(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLinearAuthStatus({ authenticated: false, error: message });
    } finally {
      setLinearAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'integrations') {
      refreshLinearAuthStatus();
    }
  }, [activeTab, refreshLinearAuthStatus]);

  const handleSaveLinearApiKey = useCallback(async () => {
    setLinearMessage(null);
    setLinearSaving(true);
    try {
      const keys: ApiKeys = {
        ...initialKeys,
        linearApiKey: linearApiKey.trim() || undefined,
      };
      await onSaveApiKeys(keys);
      setLinearMessage('Linear API key saved.');
      setTimeout(() => refreshLinearAuthStatus(), 500);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLinearMessage(message);
    } finally {
      setLinearSaving(false);
    }
  }, [initialKeys, linearApiKey, onSaveApiKeys, refreshLinearAuthStatus]);

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

  const refreshAdapterStatus = useCallback(async (packageName: string, setter: (status: AcpAdapterStatus) => void) => {
    try {
      const status = await window.agent.acpAdapterStatus(packageName);
      setter(status);
    } catch (error) {
      setter({ installed: false, installing: false, error: String(error) });
    }
  }, []);

  useEffect(() => {
    if (harness !== 'deepagents') return;
    refreshAdapterStatus(DEEPAGENTS_PACKAGE, setDeepagentsAdapterStatus);
    const interval = setInterval(() => {
      refreshAdapterStatus(DEEPAGENTS_PACKAGE, setDeepagentsAdapterStatus);
    }, 2000);
    return () => clearInterval(interval);
  }, [harness, refreshAdapterStatus]);

  useEffect(() => {
    if (harness !== 'claude-agent') return;
    refreshAdapterStatus(CLAUDE_AGENT_PACKAGE, setClaudeAdapterStatus);
    const interval = setInterval(() => {
      refreshAdapterStatus(CLAUDE_AGENT_PACKAGE, setClaudeAdapterStatus);
    }, 2000);
    return () => clearInterval(interval);
  }, [harness, refreshAdapterStatus]);

  useEffect(() => {
    if (harness !== 'codex') return;
    refreshAdapterStatus(CODEX_PACKAGE, setCodexAdapterStatus);
    const interval = setInterval(() => {
      refreshAdapterStatus(CODEX_PACKAGE, setCodexAdapterStatus);
    }, 2000);
    return () => clearInterval(interval);
  }, [harness, refreshAdapterStatus]);

  const refreshCodexAuthStatus = useCallback(async () => {
    setCodexAuthLoading(true);
    try {
      const status = await window.agent.codexAuthStatus();
      setCodexAuthStatus(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCodexAuthStatus({ adapterInstalled: false, cliInstalled: false, authenticated: false, error: message });
    } finally {
      setCodexAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (harness !== 'codex' || codexAuthMethod !== 'chatgpt-subscription') return;
    refreshCodexAuthStatus();
  }, [harness, codexAuthMethod, refreshCodexAuthStatus]);

  const handleHarnessChange = useCallback(async (nextHarness: AgentHarness) => {
    setCursorMessage(null);
    setCodexMessage(null);
    setKeysError(null);
    setKeysMessage(null);
    await onHarnessChange(nextHarness);
  }, [onHarnessChange]);

  const handleCodexLogin = useCallback(async () => {
    setCodexMessage(null);
    setCodexLoginLoading(true);
    try {
      setCodexMessage('Installing Codex CLI...');
      const result = await window.agent.codexLogin();
      if (!result.started) {
        setCodexMessage(result.error || 'Could not complete login.');
        return;
      }
      setCodexMessage('Browser opened for login. Complete authentication in your browser, then click Refresh.');
      setTimeout(() => refreshCodexAuthStatus(), 3000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCodexMessage(message);
    } finally {
      setCodexLoginLoading(false);
    }
  }, [refreshCodexAuthStatus]);

  const handleCodexLogout = useCallback(async () => {
    setCodexMessage(null);
    setCodexLogoutLoading(true);
    try {
      const result = await window.agent.codexLogout();
      if (!result.success) {
        setCodexMessage(result.error || 'Could not disconnect.');
      } else {
        setCodexMessage('Successfully disconnected from ChatGPT.');
      }
      await refreshCodexAuthStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCodexMessage(message);
    } finally {
      setCodexLogoutLoading(false);
    }
  }, [refreshCodexAuthStatus]);

  const handleCursorLogin = useCallback(async () => {
    setCursorMessage(null);
    setLoginLoading(true);
    try {
      const result = await window.agent.cursorLogin();
      if (!result.started) {
        setCursorMessage(result.error || 'Could not start Cursor login.');
        return;
      }

      setCursorMessage('Cursor login started. Complete authentication in your browser, then refresh status.');
      setTimeout(() => {
        refreshCursorStatus().catch(() => {});
      }, 1500);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCursorMessage(message);
    } finally {
      setLoginLoading(false);
    }
  }, [refreshCursorStatus]);

  const handleCursorLogout = useCallback(async () => {
    setCursorMessage(null);
    setLogoutLoading(true);
    try {
      const result = await window.agent.cursorLogout();
      if (!result.success) {
        setCursorMessage(result.error || 'Could not disconnect Cursor authentication.');
      } else {
        setCursorMessage(result.detail || 'Cursor authentication has been disconnected.');
      }
      await refreshCursorStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCursorMessage(message);
    } finally {
      setLogoutLoading(false);
    }
  }, [refreshCursorStatus]);

  const handleSaveApiKeys = useCallback(async () => {
    const keys: ApiKeys = {};
    if (anthropic.trim()) keys.anthropic = anthropic.trim();
    if (openai.trim()) keys.openai = openai.trim();
    if (baseten.trim()) keys.baseten = baseten.trim();
    if (tavily.trim()) keys.tavily = tavily.trim();
    keys.codexAuthMethod = codexAuthMethod;

    if (harness === 'deepagents' && !keys.anthropic && !keys.openai && !keys.baseten) {
      setKeysError('At least one LLM API key is required for deepagents.');
      setKeysMessage(null);
      return;
    }

    if (harness === 'claude-agent' && !keys.anthropic) {
      setKeysError('Anthropic API key is required for Claude Agent.');
      setKeysMessage(null);
      return;
    }

    if (harness === 'codex' && codexAuthMethod === 'api-key' && !keys.openai) {
      setKeysError('OpenAI API key is required when using API key authentication.');
      setKeysMessage(null);
      return;
    }

    setKeysError(null);
    setKeysMessage(null);
    setKeysLoading(true);
    try {
      await onSaveApiKeys(keys);
      setKeysMessage('Settings saved.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setKeysError(message);
    } finally {
      setKeysLoading(false);
    }
  }, [anthropic, baseten, codexAuthMethod, harness, onSaveApiKeys, openai, tavily]);

  return (
    <div className="h-full bg-[#1a2332] text-gray-100 overflow-auto">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="flex flex-col items-center gap-4">
          <Logo />
          <h2 className="text-xl font-medium text-gray-100">Settings</h2>
        </div>

        <div className="mt-6 flex gap-1 border-b border-[#2a3142]">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'general'
                ? 'text-gray-100 border-b-2 border-[#5a9bc7]'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            General
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('integrations')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'integrations'
                ? 'text-gray-100 border-b-2 border-[#5a9bc7]'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Integrations
          </button>
        </div>

        {activeTab === 'general' && (
          <>
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
            <HarnessOption
              title="Claude Agent"
              subtitle="Use Claude Agent SDK via Zed's ACP adapter."
              selected={harness === 'claude-agent'}
              onClick={() => handleHarnessChange('claude-agent')}
            />
            <HarnessOption
              title="Codex"
              subtitle="Use OpenAI Codex CLI via Zed's ACP adapter."
              selected={harness === 'codex'}
              onClick={() => handleHarnessChange('codex')}
            />
          </div>
        </section>

        {harness === 'cursor' && (
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
              {cursorStatus && !cursorStatus.cliAvailable && (
                <p className="mt-2 text-xs text-gray-400">
                  To use the Cursor harness, you need to{' '}
                  <a
                    href="https://www.cursor.com/downloads"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#5a9bc7] hover:underline"
                  >
                    download and install Cursor
                  </a>
                  .
                </p>
              )}
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={handleCursorLogin}
                disabled={loginLoading || !cursorStatus?.cliAvailable}
                className="px-4 py-2 bg-[#5a9bc7] hover:bg-[#6daad3] disabled:opacity-50 text-white rounded-md text-sm font-medium transition-colors"
              >
                {loginLoading ? 'Starting...' : 'Authenticate with Cursor CLI'}
              </button>
              <button
                type="button"
                onClick={handleCursorLogout}
                disabled={logoutLoading || !cursorStatus?.cliAvailable}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-100 rounded-md text-sm font-medium transition-colors"
              >
                {logoutLoading ? 'Disconnecting...' : 'Disconnect Cursor Auth'}
              </button>
            </div>

            {cursorMessage && (
              <p className="mt-3 text-xs text-gray-300">{cursorMessage}</p>
            )}
          </section>
        )}

        {harness === 'deepagents' && (
          <section className="mt-5 rounded-xl border border-[#2a3142] bg-[#151b26] p-5">
            <h3 className="text-sm font-semibold text-gray-200">Deepagents Setup</h3>
            <p className="mt-1 text-xs text-gray-400">
              Configure model keys used by the deepagents harness.
            </p>

            <div className="mt-4 rounded-md border border-[#2a3142] bg-[#111827] p-3">
              <div className="flex items-center gap-2 text-sm">
                <AdapterStatusDot status={deepagentsAdapterStatus} />
                <span className="text-gray-200">
                  {formatAdapterStatus(deepagentsAdapterStatus, 'Deepagents adapter')}
                </span>
              </div>
              {deepagentsAdapterStatus?.installing && (
                <p className="mt-2 text-xs text-gray-400">
                  Installing adapter... This may take a moment on first run.
                </p>
              )}
              {deepagentsAdapterStatus?.error && (
                <p className="mt-2 text-xs text-red-400">{deepagentsAdapterStatus.error}</p>
              )}
            </div>

            <div className="mt-4 space-y-4">
              <ApiKeyInput
                label="Anthropic API Key"
                placeholder="sk-ant-..."
                value={anthropic}
                onChange={setAnthropic}
                visible={showAnthropic}
                onToggleVisible={() => setShowAnthropic((v) => !v)}
              />
              <ApiKeyInput
                label="OpenAI API Key"
                placeholder="sk-..."
                value={openai}
                onChange={setOpenai}
                visible={showOpenai}
                onToggleVisible={() => setShowOpenai((v) => !v)}
              />
              <ApiKeyInput
                label="Baseten API Key (for Kimi K2.5)"
                placeholder="..."
                value={baseten}
                onChange={setBaseten}
                visible={showBaseten}
                onToggleVisible={() => setShowBaseten((v) => !v)}
              />
              <ApiKeyInput
                label="Tavily API Key (optional web search)"
                placeholder="tvly-..."
                value={tavily}
                onChange={setTavily}
                visible={showTavily}
                onToggleVisible={() => setShowTavily((v) => !v)}
              />
            </div>

            {keysError && (
              <p className="mt-3 text-xs text-red-400">{keysError}</p>
            )}
            {keysMessage && (
              <p className="mt-3 text-xs text-gray-300">{keysMessage}</p>
            )}

            <div className="mt-4">
              <button
                type="button"
                onClick={handleSaveApiKeys}
                disabled={keysLoading}
                className="px-4 py-2 bg-[#5a9bc7] hover:bg-[#6daad3] disabled:opacity-50 text-white rounded-md text-sm font-medium transition-colors"
              >
                {keysLoading ? 'Saving...' : 'Save API Keys'}
              </button>
            </div>
          </section>
        )}

        {harness === 'claude-agent' && (
          <section className="mt-5 rounded-xl border border-[#2a3142] bg-[#151b26] p-5">
            <h3 className="text-sm font-semibold text-gray-200">Claude Agent Setup</h3>
            <p className="mt-1 text-xs text-gray-400">
              Uses the Claude Agent SDK via the Zed ACP adapter.
            </p>

            <div className="mt-4 rounded-md border border-[#2a3142] bg-[#111827] p-3">
              <div className="flex items-center gap-2 text-sm">
                <AdapterStatusDot status={claudeAdapterStatus} />
                <span className="text-gray-200">
                  {formatAdapterStatus(claudeAdapterStatus, 'Claude Agent adapter')}
                </span>
              </div>
              {claudeAdapterStatus?.installing && (
                <p className="mt-2 text-xs text-gray-400">
                  Installing adapter... This may take a moment on first run.
                </p>
              )}
              {claudeAdapterStatus?.error && (
                <p className="mt-2 text-xs text-red-400">{claudeAdapterStatus.error}</p>
              )}
            </div>

            <div className="mt-4 space-y-4">
              <ApiKeyInput
                label="Anthropic API Key"
                placeholder="sk-ant-..."
                value={anthropic}
                onChange={setAnthropic}
                visible={showAnthropic}
                onToggleVisible={() => setShowAnthropic((v) => !v)}
              />
            </div>

            {keysError && (
              <p className="mt-3 text-xs text-red-400">{keysError}</p>
            )}
            {keysMessage && (
              <p className="mt-3 text-xs text-gray-300">{keysMessage}</p>
            )}

            <div className="mt-4">
              <button
                type="button"
                onClick={handleSaveApiKeys}
                disabled={keysLoading}
                className="px-4 py-2 bg-[#5a9bc7] hover:bg-[#6daad3] disabled:opacity-50 text-white rounded-md text-sm font-medium transition-colors"
              >
                {keysLoading ? 'Saving...' : 'Save API Key'}
              </button>
            </div>
          </section>
        )}

        {harness === 'codex' && (
          <section className="mt-5 rounded-xl border border-[#2a3142] bg-[#151b26] p-5">
            <h3 className="text-sm font-semibold text-gray-200">Codex Setup</h3>
            <p className="mt-1 text-xs text-gray-400">
              Uses the OpenAI Codex CLI via the Zed ACP adapter.
            </p>

            <div className="mt-4 rounded-md border border-[#2a3142] bg-[#111827] p-3">
              <div className="flex items-center gap-2 text-sm">
                <AdapterStatusDot status={codexAdapterStatus} />
                <span className="text-gray-200">
                  {formatAdapterStatus(codexAdapterStatus, 'Codex adapter')}
                </span>
              </div>
              {codexAdapterStatus?.installing && (
                <p className="mt-2 text-xs text-gray-400">
                  Installing adapter... This may take a moment on first run.
                </p>
              )}
              {codexAdapterStatus?.error && (
                <p className="mt-2 text-xs text-red-400">{codexAdapterStatus.error}</p>
              )}
            </div>

            <div className="mt-4">
              <label className="block text-sm text-gray-400 mb-2">Authentication Method</label>
              <div className="grid grid-cols-2 gap-3">
                <AuthMethodOption
                  title="API Key"
                  subtitle="Use OpenAI API key"
                  selected={codexAuthMethod === 'api-key'}
                  onClick={() => setCodexAuthMethod('api-key')}
                />
                <AuthMethodOption
                  title="ChatGPT Plus"
                  subtitle="Login with subscription"
                  selected={codexAuthMethod === 'chatgpt-subscription'}
                  onClick={() => setCodexAuthMethod('chatgpt-subscription')}
                />
              </div>
            </div>

            {codexAuthMethod === 'api-key' && (
              <div className="mt-4 space-y-4">
                <ApiKeyInput
                  label="OpenAI API Key"
                  placeholder="sk-..."
                  value={openai}
                  onChange={setOpenai}
                  visible={showOpenai}
                  onToggleVisible={() => setShowOpenai((v) => !v)}
                />
              </div>
            )}

            {codexAuthMethod === 'chatgpt-subscription' && (
              <div className="mt-4 space-y-4">
                <div className="rounded-md border border-[#2a3142] bg-[#111827] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <CodexAuthStatusDot status={codexAuthStatus} loading={codexAuthLoading} />
                      <span className="text-gray-200">
                        {codexAuthLoading
                          ? 'Checking authentication...'
                          : formatCodexAuthStatus(codexAuthStatus)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => refreshCodexAuthStatus()}
                      disabled={codexAuthLoading}
                      className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-100 rounded-md transition-colors"
                    >
                      Refresh
                    </button>
                  </div>
                  {codexAuthStatus?.error && (
                    <p className="mt-2 text-xs text-red-400">{codexAuthStatus.error}</p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {!codexAuthStatus?.authenticated ? (
                    <button
                      type="button"
                      onClick={handleCodexLogin}
                      disabled={codexLoginLoading || !codexAdapterStatus?.installed}
                      className="px-4 py-2 bg-[#5a9bc7] hover:bg-[#6daad3] disabled:opacity-50 text-white rounded-md text-sm font-medium transition-colors"
                    >
                      {codexLoginLoading ? 'Logging in...' : 'Login with ChatGPT'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleCodexLogout}
                      disabled={codexLogoutLoading}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-100 rounded-md text-sm font-medium transition-colors"
                    >
                      {codexLogoutLoading ? 'Disconnecting...' : 'Disconnect'}
                    </button>
                  )}
                </div>

                {codexMessage && (
                  <p className="text-xs text-gray-300">{codexMessage}</p>
                )}

                <p className="text-xs text-gray-500">
                  Requires a paid ChatGPT subscription (Plus, Pro, or Team).
                </p>
              </div>
            )}

            {keysError && (
              <p className="mt-3 text-xs text-red-400">{keysError}</p>
            )}
            {keysMessage && (
              <p className="mt-3 text-xs text-gray-300">{keysMessage}</p>
            )}

            <div className="mt-4">
              <button
                type="button"
                onClick={handleSaveApiKeys}
                disabled={keysLoading}
                className="px-4 py-2 bg-[#5a9bc7] hover:bg-[#6daad3] disabled:opacity-50 text-white rounded-md text-sm font-medium transition-colors"
              >
                {keysLoading ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </section>
        )}
          </>
        )}

        {activeTab === 'integrations' && (
          <section className="mt-8 rounded-xl border border-[#2a3142] bg-[#151b26] p-5">
            <div className="flex items-center gap-3">
              <LinearLogo />
              <div>
                <h3 className="text-sm font-semibold text-gray-200">Linear</h3>
                <p className="mt-0.5 text-xs text-gray-400">
                  Connect to Linear to reference issues in your conversations.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-md border border-[#2a3142] bg-[#111827] p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <LinearAuthStatusDot status={linearAuthStatus} loading={linearAuthLoading} />
                  <span className="text-gray-200">
                    {linearAuthLoading
                      ? 'Checking authentication...'
                      : formatLinearAuthStatus(linearAuthStatus)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => refreshLinearAuthStatus()}
                  disabled={linearAuthLoading}
                  className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-100 rounded-md transition-colors"
                >
                  Refresh
                </button>
              </div>
              {linearAuthStatus?.error && (
                <p className="mt-2 text-xs text-red-400">{linearAuthStatus.error}</p>
              )}
            </div>

            <div className="mt-4 space-y-4">
              <ApiKeyInput
                label="Linear API Key"
                placeholder="lin_api_..."
                value={linearApiKey}
                onChange={setLinearApiKey}
                visible={showLinearApiKey}
                onToggleVisible={() => setShowLinearApiKey((v) => !v)}
              />
              <p className="text-xs text-gray-500">
                Get your API key from{' '}
                <a
                  href="https://linear.app/settings/api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#5a9bc7] hover:underline"
                >
                  Linear Settings → API
                </a>
              </p>
            </div>

            {linearMessage && (
              <p className="mt-3 text-xs text-gray-300">{linearMessage}</p>
            )}

            <div className="mt-4">
              <button
                type="button"
                onClick={handleSaveLinearApiKey}
                disabled={linearSaving}
                className="px-4 py-2 bg-[#5a9bc7] hover:bg-[#6daad3] disabled:opacity-50 text-white rounded-md text-sm font-medium transition-colors"
              >
                {linearSaving ? 'Saving...' : 'Save Linear API Key'}
              </button>
            </div>

            <div className="mt-6 pt-4 border-t border-[#2a3142]">
              <h4 className="text-sm font-medium text-gray-300">Usage</h4>
              <p className="mt-2 text-xs text-gray-400">
                Once connected, type <code className="px-1.5 py-0.5 bg-[#111827] rounded text-gray-300">/linear</code> in the prompt bar to search and attach Linear issues to your messages.
              </p>
            </div>
          </section>
        )}

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

function AuthMethodOption({ title, subtitle, selected, onClick }: {
  title: string;
  subtitle: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
        selected
          ? 'border-[#5a9bc7] bg-[#1e2f44]'
          : 'border-[#2a3142] bg-[#111827] hover:border-gray-500'
      }`}
    >
      <div className="text-sm font-medium text-gray-100">{title}</div>
      <div className="text-xs text-gray-400">{subtitle}</div>
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
  if (!status.cliAvailable) return 'Cursor is not installed';
  if (status.authenticated && status.account) return `Authenticated as ${status.account}`;
  if (status.authenticated) return 'Authenticated';
  return 'Not authenticated';
}

function AdapterStatusDot({ status }: { status: AcpAdapterStatus | null }) {
  const className = !status
    ? 'bg-gray-500'
    : status.installing
      ? 'bg-yellow-400 animate-pulse'
      : status.installed
        ? 'bg-green-400'
        : 'bg-gray-500';

  return <span className={`w-2 h-2 rounded-full ${className}`} />;
}

function formatAdapterStatus(status: AcpAdapterStatus | null, name: string): string {
  if (!status) return 'Checking status...';
  if (status.installing) return `Installing ${name}...`;
  if (status.installed) return `${name} ready`;
  return `${name} will be installed on first use`;
}

function CodexAuthStatusDot({ status, loading }: { status: CodexAuthStatus | null; loading: boolean }) {
  const className = loading
    ? 'bg-gray-500 animate-pulse'
    : !status
      ? 'bg-gray-500'
      : !status.cliInstalled
        ? 'bg-gray-500'
        : status.authenticated
          ? 'bg-green-400'
          : 'bg-yellow-400';

  return <span className={`w-2 h-2 rounded-full ${className}`} />;
}

function formatCodexAuthStatus(status: CodexAuthStatus | null): string {
  if (!status) return 'Status unavailable';
  if (!status.cliInstalled) return 'Codex CLI not installed';
  if (status.authenticated) {
    return status.account ? `Logged in as ${status.account}` : 'Authenticated with ChatGPT';
  }
  return 'Not authenticated';
}

function ApiKeyInput({
  label,
  placeholder,
  value,
  onChange,
  visible,
  onToggleVisible,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (next: string) => void;
  visible: boolean;
  onToggleVisible: () => void;
}) {
  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2.5 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-[#5a9bc7] pr-10"
        />
        <button
          type="button"
          onClick={onToggleVisible}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-300"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function LinearLogo() {
  return (
    <div className="w-8 h-8 rounded-lg bg-[#5E6AD2] flex items-center justify-center">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M3 17L12 3L21 17H3Z" fill="white" fillOpacity="0.9" />
      </svg>
    </div>
  );
}

function LinearAuthStatusDot({ status, loading }: { status: LinearAuthStatus | null; loading: boolean }) {
  const className = loading
    ? 'bg-gray-500 animate-pulse'
    : !status
      ? 'bg-gray-500'
      : status.authenticated
        ? 'bg-green-400'
        : 'bg-yellow-400';

  return <span className={`w-2 h-2 rounded-full ${className}`} />;
}

function formatLinearAuthStatus(status: LinearAuthStatus | null): string {
  if (!status) return 'Status unavailable';
  if (status.authenticated) {
    return status.name ? `Connected as ${status.name}` : 'Connected to Linear';
  }
  return 'Not connected';
}
