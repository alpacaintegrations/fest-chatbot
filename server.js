const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');  // <-- DE NIEUWE PACKAGE
const config = require('./config');
const prompts = require('./prompts');

const app = express();
app.use(cors());
app.use(express.json());
// Serve static files from widget folder
app.use('/widget', express.static('widget'));
const genAI = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });  // <-- NIEUWE SYNTAX

// Helper: call Railway proxy
async function callAPI(endpoint, params = {}) {
  const baseUrl = config.API_BASE_URL;
  const queryString = new URLSearchParams(params).toString();
  const url = `${baseUrl}${endpoint}${queryString ? '?' + queryString : ''}`;
  
  console.log('Calling API:', url);
  const response = await fetch(url);
  const text = await response.text();
  
  if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
    console.log('Got HTML response, endpoint probably does not exist');
    return null;
  }
  
  return JSON.parse(text);
}

// Chat endpoint
app.post('/chat', async (req, res) => {
  try {
    const { message, history, lastEntities } = req.body;
console.log('\n=== User message:', message);
if (history && history.length > 0) {
  console.log('Conversation history:', history.length, 'messages');
}
    
    // Voeg context toe als er history is
let contextMessage = message;
if (history && history.length > 0) {
  const lastUserMsg = history.slice(-3).filter(h => h.role === 'user').pop();
  const lastBotMsg = history.slice(-3).filter(h => h.role === 'assistant').pop();
  
  if (lastUserMsg && lastBotMsg) {
    contextMessage = `Eerdere context:\nGebruiker vroeg: "${lastUserMsg.content}"\nBot antwoordde: "${lastBotMsg.content}"\n\nNieuwe vraag: "${message}"`;
  }
}

const extractPrompt = prompts.getExtractPrompt(contextMessage);

    const extractResult = await genAI.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: extractPrompt
    });
    const extractText = extractResult.text;
    console.log('Extract response:', extractText);
    
    // Parse JSON
    const jsonMatch = extractText.match(/\{[^}]+\}/);
    if (!jsonMatch) {
      console.log('Failed to parse:', extractText);
      return res.json({ reply: "Sorry, ik begrijp je vraag niet helemaal. Kun je het anders formuleren?" });
    }
    
    const entities = JSON.parse(jsonMatch[0]);
    console.log('Entities:', entities);
    // Gebruik lastEntities als fallback voor lege velden
if (lastEntities) {
  if (!entities.stad && lastEntities.stad) entities.stad = lastEntities.stad;
  if (!entities.datum && lastEntities.datum) entities.datum = lastEntities.datum;
  if (!entities.genre && lastEntities.genre) entities.genre = lastEntities.genre;
  if (!entities.venue && lastEntities.venue) entities.venue = lastEntities.venue;
  console.log('Merged with lastEntities:', entities);
}
    // Stap 2: Haal IDs op
    let cityId = null;
    let genreId = null;
    let venueId = null;
    
    // City lookup
    if (entities.stad && entities.stad !== 'null') {
      const cities = await callAPI(config.endpoints.cities, { search: entities.stad });
      console.log('Cities API response:', cities);
      if (cities?.data?.length > 0) {
        cityId = cities.data[0].city_id;
        console.log('Found city ID:', cityId, 'for', cities.data[0].city_woonplaats);
      }
    }
    
    // Genre lookup
    if (entities.genre && entities.genre !== 'null') {
      const genres = await callAPI(config.endpoints.genresSearch, { name: entities.genre });
      console.log('Genres API response:', genres);
      if (genres?.data?.length > 0) {
        const mainGenre = genres.data.find(g => g.type === 'main_genre');
        const genreData = mainGenre || genres.data[0];
        genreId = genreData.id;
        console.log('Found genre ID:', genreId, 'for genre:', entities.genre);
      }
    }
    
    // Venue lookup
    if (entities.venue && entities.venue !== 'null') {
      const venues = await callAPI(config.endpoints.venues, { search: entities.venue });
      console.log('Venues API response:', venues);
      if (venues?.data?.length > 0) {
        venueId = venues.data[0].podium_id;
        console.log('Found venue ID:', venueId, 'for', venues.data[0].podium_name);
      }
    }
    
    // Gebruik de slimmere datum parser van prompts
    // Gebruik de slimmere datum parser van prompts
// Gemini heeft de datum al bepaald in entities
const datum = entities.datum && entities.datum !== 'null' ? entities.datum : null;
console.log('Datum from Gemini:', datum);
    
    // Stap 3: Haal events op
    if (!cityId && !genreId && !venueId) {
      return res.json({ reply: "Geef me een stad, genre of podium om naar te zoeken!" });
    }
    
    const eventParams = {};
    if (cityId) eventParams.city = cityId;
    if (genreId) eventParams.genre = genreId;
    if (venueId) eventParams.venue = venueId;
    if (datum) eventParams.date = datum;
    
    console.log('Event params:', eventParams);
    
    const eventsData = await callAPI(config.endpoints.events, eventParams);
    console.log('Events response:', eventsData);

    let events = eventsData?.data || [];
    // DEBUG: log eerste event om veldnamen te zien
if (events.length > 0) {
  console.log('FIRST EVENT STRUCTURE:', JSON.stringify(events[0], null, 2));
}

    if (!events || events.length === 0) {
      return res.json({ reply: "Geen evenementen gevonden met deze filters. Probeer iets anders!" });
    }

    // Filter op tijdslot als gebruiker een tijd heeft aangegeven
    if (entities.tijdslot && events.length > 0) {
      const timeFiltered = events.filter(event => {
        const hour = parseInt(event.event_date_time.split(' ')[1].split(':')[0]);
        
        switch(entities.tijdslot) {
          case 'ochtend':
            return hour >= 6 && hour < 12;
          case 'middag':
            return hour >= 12 && hour < 17;
          case 'avond':
            return hour >= 17 && hour < 24;
          case 'nacht':
            return hour >= 22 || hour < 6;
          default:
            return true;
        }
      });
      if (timeFiltered.length > 0) {
        events = timeFiltered;
        console.log(`Filtered to ${events.length} events for tijdslot: ${entities.tijdslot}`);
      }
    }

    // Filter op EXACTE datum - HIER!
if (datum) {
  events = events.filter(event => {
    const eventDate = event.event_date_time.split(' ')[0];
    return eventDate === datum;
  });
  console.log(`Filtered to ${events.length} events on exact date: ${datum}`);
}
    // Maak structured response
    // Maak structured response met originele logica
const eventCount = events.length;

let intro, eventsToShow, outro;

if (eventCount <= 20 && eventCount > 0) {
  // 20 of minder - toon alles
  intro = "Dit is er allemaal te doen:";
  eventsToShow = events;
  outro = "Laat me weten hoeveel tickets je wilt, dan regel ik dat meteen voor je.";
  
} else if (eventCount > 20) {
  // Meer dan 20 - toon voorbeelden en vraag voorkeur
  intro = `Ik heb ${eventCount} opties gevonden. Dat zijn er veel! Ik kan het overzichtelijker maken.`;
  eventsToShow = events.slice(0, 5); // 5 diverse voorbeelden
  outro = `Dit zijn maar een paar voorbeelden uit alle ${eventCount} opties. Heb je een voorkeur voor:\n• Een specifieke artiest of voorstelling\n• Een bepaalde zaal of locatie\n• Een muziekstijl\n• Een bepaald tijdstip (middag/avond/nacht)\n\nLaat me weten waar je voorkeur naar uitgaat en hoeveel tickets je wilt, dan regel ik dat meteen voor je.`;
  
} else {
  // Geen events
  intro = "Geen evenementen gevonden met deze filters.";
  eventsToShow = [];
  outro = "Probeer een andere datum of stad.";
}

const response = {
  intro: intro,
  events: eventsToShow.map(e => ({
  id: e.event_id,
  titel: e.event_titel || e.titel || e.event_name || 'Event',
  datum: e.event_date_time.split(' ')[0],
  tijd: e.event_date_time.split(' ')[1] || 'Tijd nog niet bekend',
  venue: e.podium_name,
  stad: e.city_woonplaats,
  beschrijving: e.event_extra_info || 'Geen beschrijving beschikbaar'  // NIEUW
})),
  outro: outro,
  totalCount: eventCount,
  entities: {  // VOEG DIT TOE
    stad: entities.stad,
    datum: datum,
    genre: entities.genre,
    venue: entities.venue,
    tijdslot: entities.tijdslot
  }
};

return res.json(response);
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'Festival Chatbot API running' });
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});