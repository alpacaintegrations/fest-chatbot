module.exports = {
  // API configuratie
  API_BASE_URL: 'https://fest-proxy-production.up.railway.app',
  GEMINI_API_KEY: 'AIzaSyB8jlyZg_6TJ0__exGifXiE8FM6xACA2p0',
  
  // Endpoints
  endpoints: {
    cities: '/cities',
    provinces: '/provinces', 
    venues: '/venues',
    genres: '/genres',
    genresSearch: '/genres/search',
    subgenres: '/genres/:id/subgenres',
    events: '/events'
  },
  
  // Datum helpers
  getDates: () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    const saturday = new Date(today);
    const daysUntilSaturday = ((6 - today.getDay()) + 7) % 7 || 7;
    saturday.setDate(today.getDate() + daysUntilSaturday);
    
    return {
      today: today.toISOString().split('T')[0],
      tomorrow: tomorrow.toISOString().split('T')[0],
      weekend: saturday.toISOString().split('T')[0]
    };
  }
};