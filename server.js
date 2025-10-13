// Only load .env locally, Railway uses environment variables
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/widget', express.static('widget'));

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});

// MCP Server URL
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'https://fest.nl/api/mcp.php';

// Helper: call MCP server to get available tools
async function getMCPTools() {
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

// Helper: call MCP tool
async function callMCPTool(toolName, args) {
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

// Chat endpoint
app.post('/chat', async (req, res) => {
  try {
    const { message, history, lastEntities } = req.body;
    console.log('\n=== User message:', message);
    
    // Get available MCP tools
    const mcpTools = await getMCPTools();
    
    if (mcpTools.length === 0) {
      return res.json({ 
        reply: "Sorry, de festival info tools zijn momenteel niet beschikbaar."
      });
    }
    
    // Convert MCP tools to Claude format
    const claudeTools = mcpTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema
    }));
    
    // Build messages with history (text only, no tool results)
const messages = [];

// Add conversation history as text only
if (history && history.length > 0) {
  const recentHistory = history.slice(-16); // Last 8 exchanges
  recentHistory.forEach(h => {
    // Only add text content, skip tool use/results from history
    if (typeof h.content === 'string') {
      messages.push({
        role: h.role === 'user' ? 'user' : 'assistant',
        content: h.content
      });
    }
  });
}

// Add current message
messages.push({
  role: 'user',
  content: message
});
    
    // System prompt
const today = new Date();
const tomorrow = new Date(today.getTime() + 86400000);

// Calculate weekend dates
const dayOfWeek = today.getDay(); // 0=zondag, 1=maandag, etc
const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
const friday = new Date(today.getTime() + (daysUntilFriday * 86400000));
const saturday = new Date(friday.getTime() + 86400000);
const sunday = new Date(saturday.getTime() + 86400000);

const systemPrompt = `Je bent een professionele Nederlandse festival assistent voor FestivalInfo.nl.

BELANGRIJK: Gebruik ALTIJD de beschikbare festivalinfo tools om events op te zoeken. Zoek NIET online.

## DATUM CONTEXT (vandaag):
- Vandaag: ${today.toISOString().split('T')[0]} (${['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'][dayOfWeek]})
- Morgen: ${tomorrow.toISOString().split('T')[0]}
- Aankomend weekend:
  * Vrijdag: ${friday.toISOString().split('T')[0]}
  * Zaterdag: ${saturday.toISOString().split('T')[0]}
  * Zondag: ${sunday.toISOString().split('T')[0]}

## DATUM HERKENNING:
- "vanavond"/"vandaag"/"straks" → ${today.toISOString().split('T')[0]}
- "morgen"/"morgenavond" → ${tomorrow.toISOString().split('T')[0]}
- "dit weekend" → DRIE calls: ${friday.toISOString().split('T')[0]}, ${saturday.toISOString().split('T')[0]}, ${sunday.toISOString().split('T')[0]}

BELANGRIJK: "weekend" = vrijdag (vanaf 18:00) + zaterdag + zondag


## FLOW:
1. Gebruiker vraagt naar concerten/festivals
2. Zoek eerst stad/provincie/venue met juiste tool
3. Zoek genre als relevant
4. Haal events op met search_events

## CONTEXT & VERFIJNING:
- Als de user NET een zoekopdracht deed met >20 results
- EN de user geeft nu een voorkeur (genre/tijd/locatie)
- DAN: Verfijn de VORIGE zoekopdracht met die extra filter
- Voorbeeld: "Amsterdam deze week" (84 results) → "metal" → Zoek: Amsterdam + deze week + metal

## FLOW:

## RESPONSE FORMATTING:

### Als MEER DAN 20 events gevonden:

1. filter op beschikbaarheid (laat uitverkochte events weg) Zijn het er <20, ga dan naar "als 5-20 events gevonden"
2. Zeg: "Ik heb [X] opties gevonden. Dat zijn er veel! Ik kan het overzichtelijker maken."
3. Vraag EXPLICIET: "Wil je het overzichtelijker? Ik kan filteren op:"
   • **Artiest of voorstelling** (noem een naam)
   • **Locatie/zaal** (bijv. Paradiso, Melkweg, 013)
   • **Muziekstijl** (bijv. rock, techno, jazz, metal)
   • **Tijdstip** (middag, avond, of nacht)
   • **Dag** (vrijdag, zaterdag, zondag)
4. Toon 5 DIVERSE voorbeelden (varieer in tijd/locatie) Maximaal 5 events voor overzichtelijkheid
5. Zeg: "Dit zijn maar een paar voorbeelden uit alle [X] opties. Laat nooit uitverkochte events zien in de voorbeelden."
6. STOP HIER - vraag NIET naar tickets bij >20 events
7. ALS user vraagt "toon alle evenementen" → doe dat gewoon

### Als 5-20 events gevonden:
- Toon ALLE events overzichtelijk
- Geef per event: artiest/show, datum, tijd, venue, stad
- Eindig met: "Laat me weten hoeveel tickets je wilt, dan regel ik dat meteen voor je."

### Als MINDER DAN 5 events gevonden:
- Toon alle events
- Eindig met: "Laat me weten hoeveel tickets je wilt, dan regel ik dat meteen voor je."
- OF stel voor breder te zoeken: "Wil je dat ik breder zoek (andere datums/steden)?"

### Als GEEN events gevonden:
- Zeg: "Ik kan helaas niks vinden met deze zoekopdracht."
- Stel voor: "Zal ik breder zoeken? Andere tijden/locaties/datums?"
- Vraag wat voorkeur heeft

## BELANGRIJK:
- Vraag ALLEEN naar tickets als er ≤20 events zijn
- Bij >20: alleen voorkeur vragen, NIET tickets
- Als user expliciet om alle events vraagt bij >20 → toon ze allemaal + vraag dan pas om tickets

## STIJL:
- Nederlands, vriendelijk, professioneel
- Gebruik emoji's voor leesbaarheid (🎵 🎭 🎤 etc)
- Compacte formatting`;

    // Call Claude with tools
    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages,
      tools: claudeTools
    });
    
    console.log('Claude response:', response.stop_reason);
    
    // Handle tool use
while (response.stop_reason === 'tool_use') {
  // Find ALL tool_use blocks
  const toolUses = response.content.filter(block => block.type === 'tool_use');
  
  if (toolUses.length === 0) break;
  
  // Add assistant response
  messages.push({
    role: 'assistant',
    content: response.content
  });
  
  // Call ALL tools and collect results
  const toolResults = [];
  for (const toolUse of toolUses) {
    console.log(`Calling MCP tool: ${toolUse.name}`);
    console.log('With args:', toolUse.input);
    
    const toolResult = await callMCPTool(toolUse.name, toolUse.input);
    
    toolResults.push({
      type: 'tool_result',
      tool_use_id: toolUse.id,
      content: JSON.stringify(toolResult)
    });
  }
  
  // Add ALL tool results in one message
  messages.push({
    role: 'user',
    content: toolResults
  });
      
      // Get next response
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: messages,
        tools: claudeTools
      });
      
      console.log('Claude follow-up:', response.stop_reason);
    }
    
    // Extract final text response
const textBlock = response.content.find(block => block.type === 'text');
const reply = textBlock?.text || 'Sorry, ik kon geen antwoord genereren.';

// Try to find events from ALL search_events tool calls
let eventsData = [];
let requestedDates = new Set(); // Track which dates Claude requested
let totalCount = 0;

// First pass: collect requested dates from search_events calls
for (let i = 0; i < messages.length; i++) {
  const msg = messages[i];
  if (msg.role === 'assistant' && Array.isArray(msg.content)) {
    msg.content.forEach(block => {
      if (block.type === 'tool_use' && block.name === 'search_events' && block.input?.date) {
        requestedDates.add(block.input.date);
      }
    });
  }
}

console.log('Requested dates:', Array.from(requestedDates));

// Second pass: collect events and filter by date
for (let i = 0; i < messages.length; i++) {
  const msg = messages[i];
  if (msg.role === 'user' && Array.isArray(msg.content)) {
    msg.content.forEach(item => {
      if (item.type === 'tool_result') {
        try {
          const toolContent = item.content;
          const parsed = JSON.parse(toolContent);
          
          if (parsed.content && parsed.content[0]?.text) {
            const resultData = JSON.parse(parsed.content[0].text);
            if (resultData.status === 'success' && resultData.data && Array.isArray(resultData.data)) {
              // Filter: only events on requested dates
              const filtered = resultData.data.filter(e => {
                const eventDate = e.event_date_time.split(' ')[0];
                return requestedDates.size === 0 || requestedDates.has(eventDate);
              });
              eventsData = eventsData.concat(filtered);
            }
          }
        } catch (e) {
          // Skip parsing errors
        }
      }
    });
  }
}

// If we have events, return structured response
if (eventsData.length > 0) {
  // Filter uitverkochte events
  const availableEvents = eventsData.filter(e => !e.event_uitverkocht);
  const totalAvailable = availableEvents.length;
  
  // Determine how many to show
  let eventsToShow;
  if (totalAvailable > 20) {
    eventsToShow = availableEvents.slice(0, 5);
  } else {
    eventsToShow = availableEvents;
  }
  
  // Split Claude's response into intro and outro
  const lines = reply.split('\n\n');
  const intro = lines[0] || reply;
  const outro = lines[lines.length - 1] || "Laat me weten waar je voorkeur naar uitgaat!";
  
  return res.json({
    intro: intro,
    events: eventsToShow.map(e => ({
      id: e.event_id,
      titel: e.event_name || e.event_titel || 'Event',
      datum: e.event_date_time.split(' ')[0],
      tijd: e.event_date_time.split(' ')[1] || '00:00:00',
      venue: e.podium_name,
      stad: e.podium_town,
      beschrijving: e.event_extra_info || 'Geen beschrijving beschikbaar'
    })),
    outro: outro,
    totalCount: totalAvailable
  });
}

// Fallback: plain text response
return res.json({ reply });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      error: error.message,
      reply: 'Er ging iets mis. Probeer het opnieuw.'
    });
  }
});
// Debug endpoint: show available MCP tools
app.get('/tools', async (req, res) => {
  const tools = await getMCPTools();
  res.json({ 
    count: tools.length,
    tools: tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: Object.keys(t.inputSchema?.properties || {})
    }))
  });
});

app.get('/', (req, res) => {
  res.json({ status: 'Festival Chatbot API with MCP running' });
});
app.get('/', (req, res) => {
  res.json({ status: 'Festival Chatbot API with MCP running' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`MCP Server: ${MCP_SERVER_URL}`);
});