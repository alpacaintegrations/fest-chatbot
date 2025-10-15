// mcp-client.js
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'https://fest.nl/api/mcp.php';

class MCPClient {
  // Haal beschikbare tools op
  async getTools() {
    try {
      const response = await fetch(MCP_SERVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1
        })
      });
      
      const data = await response.json();
      console.log('MCP Tools available:', data.result?.tools?.length || 0);
      return data.result?.tools || [];
    } catch (error) {
      console.error('Failed to get MCP tools:', error);
      return [];
    }
  }

  // Roep een tool aan
  async callTool(toolName, args) {
    try {
      const response = await fetch(MCP_SERVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: args
          },
          id: Date.now()
        })
      });
      
      const data = await response.json();
      console.log(`MCP Tool ${toolName} result:`, data.result);
      return data.result;
    } catch (error) {
      console.error(`MCP Tool ${toolName} failed:`, error);
      return { error: error.message };
    }
  }
}

module.exports = new MCPClient();