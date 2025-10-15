// gemini-adapter.js
const mcpClient = require('./mcp-client');

class GeminiAdapter {
  // Converteer MCP tools naar Gemini function declarations
  convertToolsToGemini(mcpTools) {
    return mcpTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties: tool.inputSchema?.properties || {},
        required: tool.inputSchema?.required || []
      }
    }));
  }

  // Voer function call uit via MCP
  async executeFunctionCall(functionCall) {
    const { name, args } = functionCall;
    console.log(`Executing function: ${name}`, args);
    
    const result = await mcpClient.callTool(name, args);
    
    return {
      name: name,
      response: result
    };
  }
}

module.exports = new GeminiAdapter();