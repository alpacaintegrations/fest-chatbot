// Load .env for local development
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const mcpClient = require('./mcp-client');
const geminiAdapter = require('./gemini-adapter');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/widget', express.static('widget'));

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Chat endpoint
app.post('/chat', async (req, res) => {
  try {
    const { message, history } = req.body;
    console.log('\n=== User message:', message);
    
    // Track events and dates during function calls
    let eventsData = [];
    let requestedDates = new Set();
    
    // 1. Haal MCP tools op
    const mcpTools = await mcpClient.getTools();
    
    if (mcpTools.length === 0) {
      return res.json({ 
        reply: "Sorry, de festival info tools zijn momenteel niet beschikbaar."
      });
    }
    
    // 2. Converteer naar Gemini format
    const geminiTools = geminiAdapter.convertToolsToGemini(mcpTools);
    
    // 3. Build chat history
    const chatHistory = [];
    if (history && history.length > 0) {
      const recentHistory = history.slice(-16);
      recentHistory.forEach(h => {
        if (typeof h.content === 'string') {
          chatHistory.push({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.content }]
          });
        }
      });
    }
    
    // 4. System prompt
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 86400000);
    const dayOfWeek = today.getDay();
    const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
    const friday = new Date(today.getTime() + (daysUntilFriday * 86400000));
    const saturday = new Date(friday.getTime() + 86400000);
    const sunday = new Date(saturday.getTime() + 86400000);

    const systemInstruction = `Je bent een professionele Nederlandse festival assistent voor FestivalInfo.nl.

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

## RESPONSE FORMATTING:

### Als MEER DAN 20 events gevonden:

### Als MEER DAN 20 events gevonden:

KRITISCH - VOLG DEZE STAPPEN EXACT:

1. Filter EERST op beschikbaarheid (verwijder uitverkochte events)
   - Als er dan <20 over zijn → ga naar "Als 5-20 events gevonden"
   - Anders ga door naar stap 2

2. ALTIJD zeggen: "Ik heb [X] beschikbare opties gevonden."

3. STOP - toon GEEN events nog!

4. ALTIJD vragen: "Heb je een voorkeur voor:"
   • Een specifieke artiest of voorstelling
   • Een bepaalde locatie of zaal
   • Een muziekstijl (rock, pop, jazz, metal, dance, etc.)
   • Een tijdstip (middag, avond, nacht)
   • Een specifieke dag

5. Toon NU pas MAXIMAAL 5 diverse voorbeelden
   - Varieer in datum, tijd en locatie
   - GEEN uitverkochte events tonen!
   - Format: [Artiest] - [dag DD maand] om [tijd] - [Venue], [Stad]

6. Zeg: "Dit zijn maar een paar voorbeelden uit alle [X] beschikbare opties."

7. CRUCIAAL: vraag NIET naar tickets! Alleen naar voorkeuren!

8. Wacht op user input om te verfijnen

VERBODEN bij >20 events:
❌ Meer dan 5 events tonen
❌ Vragen naar aantal tickets
❌ Alle events tonen zonder te vragen

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

    // 5. Initialize model
    const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-exp",
  systemInstruction: systemInstruction,
  tools: [{ functionDeclarations: geminiTools }],
  generationConfig: {
    temperature: 0.3,  // Lager = strikter (0-2, default is 1)
    topP: 0.8,         // Focust op meest waarschijnlijke antwoorden
    topK: 40           // Beperkt keuzes
  }
});

    // 6. Start chat
    const chat = model.startChat({
      history: chatHistory
    });

    // 7. Send message
    let result = await chat.sendMessage(message);
    let response = result.response;

    // 8. Handle function calls
    while (response.candidates?.[0]?.content?.parts?.some(part => part.functionCall)) {
      const functionCalls = response.candidates[0].content.parts
        .filter(part => part.functionCall)
        .map(part => part.functionCall);

      console.log('Function calls:', functionCalls.length);

      // Execute ALL function calls
      const functionResponses = [];
      for (const fc of functionCalls) {
        // Track dates from search_events calls
        if (fc.name === 'search_events' && fc.args?.date) {
          requestedDates.add(fc.args.date);
        }
        
        const result = await geminiAdapter.executeFunctionCall({
          name: fc.name,
          args: fc.args
        });
        
        // Parse events from MCP response
        try {
          if (result.response?.content?.[0]?.text) {
            const parsed = JSON.parse(result.response.content[0].text);
            if (parsed.status === 'success' && Array.isArray(parsed.data)) {
              // Filter by requested dates
              const filtered = parsed.data.filter(e => {
                const eventDate = e.event_date_time.split(' ')[0];
                return requestedDates.size === 0 || requestedDates.has(eventDate);
              });
              eventsData = eventsData.concat(filtered);
            }
          }
        } catch (e) {
          // Skip parsing errors
        }
        
        functionResponses.push({
          functionResponse: {
            name: result.name,
            response: result.response
          }
        });
      }

      // Send results back to Gemini
      result = await chat.sendMessage(functionResponses);
      response = result.response;
    }

    // 9. Extract final text
    const textPart = response.candidates?.[0]?.content?.parts?.find(part => part.text);
    const reply = textPart?.text || 'Sorry, ik kon geen antwoord genereren.';

    console.log('Requested dates:', Array.from(requestedDates));
    console.log('Total events found:', eventsData.length);

    // 10. Return structured response if we have events
    if (eventsData.length > 0) {
      const availableEvents = eventsData.filter(e => !e.event_uitverkocht);
      const totalAvailable = availableEvents.length;
      
      let eventsToShow;
      if (totalAvailable > 20) {
        eventsToShow = availableEvents.slice(0, 5);
      } else {
        eventsToShow = availableEvents;
      }
      
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

    // 11. Fallback: plain text
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
  const tools = await mcpClient.getTools();
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
  res.json({ status: 'Festival Chatbot API with MCP + Gemini running' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Using Gemini with MCP Server: ${process.env.MCP_SERVER_URL || 'https://fest.nl/api/mcp.php'}`);
});