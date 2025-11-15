import { MCPClient } from '@mastra/mcp';

const requireTavilyApiKey = () => {
  const key = process.env.TAVILY_API_KEY;
  if (!key || key.trim() === '') {
    throw new Error('TAVILY_API_KEY is not configured.');
  }
  return key;
};

export const tavilyMcpClient = new MCPClient({
  id: 'tavily-mcp',
  servers: {
    tavily: {
      command: 'npx',
      args: ['-y', 'tavily-mcp'],
      env: {
        ...process.env,
        TAVILY_API_KEY: requireTavilyApiKey(),
      },
      timeout: 60_000,
    },
  },
});
