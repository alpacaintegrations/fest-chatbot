module.exports = {
  // Extract prompt - haalt entities uit gebruiker vraag
  getExtractPrompt: (message) => `Analyseer deze vraag: "${message}"

Extract de volgende informatie:
- stad: Nederlandse stad naam (Amsterdam, Utrecht, Rotterdam, Den Haag, etc.) of null
- venue: podium/zaal naam (Paradiso, Melkweg, Ziggo Dome, AFAS Live, Carré, etc.) of null  
- genre: muziekstijl (rock, pop, jazz, techno, metal, dance, cabaret, comedy, etc.) of null
- tijdslot: tijd indicatie (ochtend, middag, avond, nacht) of null
- datum: NIET INVULLEN, altijd null

TIJDSLOT HERKENNING - BELANGRIJK:
- "vanavond", "'s avonds", "avond" -> "avond"
- "laat", "late", "vannacht", "'s nachts", "na middernacht" -> "nacht"
- "10 uur", "11 uur", "9 uur" (ZONDER 's ochtends) -> "avond" (assume PM)
- "8 uur", "7 uur", "6 uur" -> "avond" (typische concert tijden)
- "3 uur", "4 uur", "5 uur" -> "middag" (tenzij context suggereert nacht)
- "overdag", "middag", "'s middags", "lunch" -> "middag"
- ALLEEN bij "ochtend", "'s ochtends", "vroeg", "voor de middag" -> "ochtend"

Context regels:
- Bij twijfel tussen avond/ochtend: kies avond (meer events)
- "Feesten", "stappen", "uitgaan" -> altijd "nacht"
- "Festival" zonder tijd -> geen tijdslot (hele dag)

Stad synoniemen:
- Mokum, A'dam, 020 = Amsterdam
- 010 = Rotterdam
- 070 = Den Haag

Output ALLEEN JSON:
{"stad": "...", "genre": "...", "venue": "...", "tijdslot": "...", "datum": null}`
  // Format prompt - maakt het antwoord
  getFormatPrompt: (message, events, originalFilters = {}) => {
    // Filter uitverkochte en afgelaste events
    const activeEvents = events.filter(e => !e.event_uitverkocht && !e.event_afgelast);
    const eventCount = activeEvents.length;
    
    // Als niks gevonden met filters
    if (eventCount === 0 && originalFilters) {
      const hasFilters = originalFilters.stad || originalFilters.venue || originalFilters.genre || originalFilters.tijdslot;
      
      if (hasFilters) {
        return `Je bent een professionele Nederlandse ticket assistent.
      
Gebruiker vraagt: "${message}"

Er zijn geen beschikbare evenementen gevonden met deze specifieke filters.

INSTRUCTIES:
1. Zeg: "Ik kan helaas niks vinden met deze specifieke zoekopdracht."
2. Stel voor: "Zal ik wat ruimer zoeken? Ik kan kijken naar:"
   - Andere tijdstippen ${originalFilters.tijdslot ? "dan " + originalFilters.tijdslot : ""}
   - Andere locaties ${originalFilters.venue ? "dan " + originalFilters.venue : ""}
   - ${originalFilters.stad ? "Andere steden in de buurt" : ""}
3. Vraag: "Wat heeft je voorkeur?"

Professioneel en behulpzaam.`;
      }
    }
    
    // 20 of minder events
    if (eventCount <= 20 && eventCount > 0) {
      return `Je bent een professionele Nederlandse ticket assistent.

Gebruiker vraagt: "${message}"

Er zijn ${eventCount} beschikbare evenementen gevonden:
${JSON.stringify(activeEvents, null, 2)}

INSTRUCTIES:
1. Start met: "Ik heb ${eventCount} ${eventCount === 1 ? 'optie' : 'opties'} voor je gevonden:"
2. Toon ALLE evenementen, ELK als apart punt
3. Per event vermeld:
   - Naam artiest/voorstelling
   - Dag, datum en tijd (voorbeeld: "dinsdag 8 oktober om 20:00")
   - Venue naam
   - Als aanvangstijd 00:00 is, zeg dan "tijd nog niet bekend"
4. Sluit ALTIJD af met: "Laat me weten naar welk evenement je wilt en hoeveel tickets je nodig hebt, dan regel ik dat direct voor je."

Format elk event exact zo:
- [Artiest/Show] - [dag] [datum] om [tijd] - [Venue]

Geen emojis. Professioneel maar vriendelijk.`;
    }
    
    // Meer dan 20 events
    if (eventCount > 20) {
      return `Je bent een professionele Nederlandse ticket assistent.

Gebruiker vraagt: "${message}"

Er zijn ${eventCount} evenementen gevonden.
Eerste 10 voor context: ${JSON.stringify(activeEvents.slice(0, 10), null, 2)}

INSTRUCTIES:
1. Zeg: "Ik heb ${eventCount} opties gevonden. Dat zijn er te veel om overzichtelijk te tonen."
2. Zeg: "Ik kan het overzichtelijker maken door te filteren. Heb je een voorkeur voor:"
   - Een specifieke artiest of voorstelling
   - Een bepaalde zaal of locatie  
   - Een muziekstijl of type evenement
   - Een bepaald tijdstip (ochtend/middag/avond/nacht)
   - Een specifieke dag
3. Toon als voorbeeld 3 VERSCHILLENDE events (verschillende tijden/venues)
4. Format: "Bijvoorbeeld: [Artiest] - [datum] om [tijd] in [Venue]"
5. Eindig met: "Of zal ik alle ${eventCount} opties voor je tonen?"

Professioneel en behulpzaam. Help de gebruiker keuzes maken.`;
    }
    
    // Geen events
    return `Je bent een professionele Nederlandse ticket assistent.
      
Gebruiker vraagt: "${message}"

Er zijn geen evenementen gevonden.

Vraag of je op een andere datum of in een andere stad kan zoeken.
Wees behulpzaam en vraag wat de gebruiker graag wil zien.`;
  },

  // Slimmere datum parsing
  datumHelpers: {
    parseUserDate: (message) => {
      const today = new Date();
      const lowMessage = message.toLowerCase();
      
      // Vandaag/vanavond/straks
      if (lowMessage.includes('vandaag') || 
          lowMessage.includes('vanavond') || 
          lowMessage.includes('straks') ||
          lowMessage.includes('nu')) {
        return today.toISOString().split('T')[0];
      }
      
      // Morgen
      if (lowMessage.includes('morgen')) {
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        return tomorrow.toISOString().split('T')[0];
      }
      
      // Overmorgen
      if (lowMessage.includes('overmorgen')) {
        const dayAfter = new Date(today);
        dayAfter.setDate(today.getDate() + 2);
        return dayAfter.toISOString().split('T')[0];
      }
      
      // Weekend (komende zaterdag)
      if (lowMessage.includes('weekend') || 
          lowMessage.includes('zaterdag')) {
        const saturday = new Date(today);
        const dayOfWeek = today.getDay();
        const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
        saturday.setDate(today.getDate() + daysUntilSaturday);
        return saturday.toISOString().split('T')[0];
      }
      
      // Zondag
      if (lowMessage.includes('zondag')) {
        const sunday = new Date(today);
        const dayOfWeek = today.getDay();
        const daysUntilSunday = (7 - dayOfWeek + 7) % 7 || 7;
        sunday.setDate(today.getDate() + daysUntilSunday);
        return sunday.toISOString().split('T')[0];
      }
      
      // Volgende week
      if (lowMessage.includes('volgende week')) {
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        return nextWeek.toISOString().split('T')[0];
      }
      
      // Over X weken
      const weeksMatch = lowMessage.match(/over (\d+|twee|drie|vier) weken/);
      if (weeksMatch) {
        let weeks = 1;
        if (weeksMatch[1] === 'twee') weeks = 2;
        else if (weeksMatch[1] === 'drie') weeks = 3;
        else if (weeksMatch[1] === 'vier') weeks = 4;
        else weeks = parseInt(weeksMatch[1]);
        
        const futureDate = new Date(today);
        futureDate.setDate(today.getDate() + (weeks * 7));
        return futureDate.toISOString().split('T')[0];
      }
      
      // Default: vandaag
      return today.toISOString().split('T')[0];
    }
  }
};