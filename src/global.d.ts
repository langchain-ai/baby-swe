interface AgentResponse {
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
    output?: string;
    error?: string;
  }>;
}

interface Window {
  versions: {
    node: () => string;
    chrome: () => string;
    electron: () => string;
  };
  agent: {
    invoke: (message: string) => Promise<AgentResponse>;
  };
}
