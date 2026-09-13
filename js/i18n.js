// Two languages: English and Italian (the reference app is Italian).
const STRINGS = {
  en: {
    appTitleA: 'MOTO', appTitleB: 'SPEED',
    start: 'Start', stop: 'Stop', reset: 'Reset',
    resetConfirm: 'Reset the current session stats?',
    stopConfirm: 'Stop and save this session?',
    time: 'TIME', arrival: 'ARRIVAL', total: 'TOTAL', remaining: 'LEFT',
    speed: 'SPEED', max: 'MAX',
    avgSpeed: 'Ø AVG', maxAccel: 'MAX ACC', maxBrake: 'MAX BRAKE', brakeDist: 'BRAKE DIST',
    cal: 'CAL', calibrating: 'CAL…', calibrated: 'Lean angle calibrated',
    enableSensors: 'Tap to enable lean sensor',
    sensorsDenied: 'Motion sensor permission denied. Enable it in Settings › Safari › Motion & Orientation Access.',
    gpsWaiting: 'Waiting for GPS…', gpsDenied: 'Location permission denied.',
    gpsAcc: 'GPS ±{n} m',
    menu: 'Menu', settings: 'Settings', history: 'Session history', navigator: 'Navigator', done: 'Done',
    close: 'Close', cancel: 'Cancel', select: 'Select', delete: 'Delete', share: 'Share', back: 'Back',
    // Settings
    theme: 'THEME', panelColor: 'Panel color',
    colorOrange: 'Orange', colorRed: 'Red', colorBlue: 'Blue', colorGreen: 'Green', colorYellow: 'Yellow', colorWhite: 'White', colorPurple: 'Purple',
    leanSection: 'LEAN ANGLE', phonePos: 'Phone position',
    posFrame: 'Frame / Tank', posBars: 'Handlebar', posBag: 'Tank bag',
    posHint: 'The phone is fixed to the bars: steering input slightly contaminates lean readings at low speed. Calibrate with the bike upright and bars straight.',
    posHintFrame: 'The phone is fixed to the frame or tank, so lean is read directly from the chassis. Calibrate with the bike upright.',
    invertLean: 'Invert left/right', autoCal: 'Auto-calibrate on first reading',
    language: 'LANGUAGE', lang: 'Language', units: 'UNITS', unitSystem: 'Unit system', metric: 'Metric (km/h)', imperial: 'Imperial (mph)',
    navigation: 'NAVIGATION', voiceGuidance: 'Voice announcements', testVoice: 'Test co-pilot',
    testVoiceText: 'Co-pilot ready. Ride safe.',
    mapSection: 'MAP', mapStyle: 'Map style', mapLight: 'Light', mapDark: 'Dark', mapFollow: 'Follow position',
    display: 'DISPLAY', keepAwake: 'Keep screen on', demoMode: 'Demo mode (simulated ride)',
    demoHint: 'Fakes GPS and lean data so you can see the dashboard working indoors.',
    data: 'DATA', clearHistory: 'Delete all sessions', clearConfirm: 'Delete all saved sessions? This cannot be undone.',
    about: 'ABOUT', version: 'Version',
    // History
    noSessions: 'No sessions yet. Tap ▶ to start recording a ride.',
    deleteN: 'Delete ({n})', deleteConfirm: 'Delete {n} session(s)?',
    sessionDetail: 'Session', duration: 'Duration', distance: 'Distance', movingTime: 'Moving time',
    exportGpx: 'Export GPX',
    // Navigator
    searchDest: 'Search destination…', searching: 'Searching…', noResults: 'No results.',
    enterDest: 'Enter a destination to calculate a route.',
    avoidTolls: 'Avoid tolls', avoidTollsSub: 'Avoid toll roads',
    avoidMotorways: 'Avoid motorways', avoidMotorwaysSub: 'Prefer national and provincial roads',
    avoidFerries: 'Avoid ferries', avoidFerriesSub: 'Land routes only',
    savePlace: 'Save place', favorites: 'Favorites', loadGpx: 'Load GPX', motoRoutes: 'Moto routes',
    fuel: 'Fuel', restaurants: 'Restaurants', hotels: 'Hotels', parking: 'Parking',
    savePlacePrompt: 'Name for this place:', currentLocation: 'Current location', noFavorites: 'No saved places.',
    nearby: 'Nearby', routing: 'Calculating route…', routeError: 'Could not calculate a route.',
    routeTo: 'Route to', startNav: 'Start navigation', endNav: 'End navigation', endNavConfirm: 'End navigation?',
    noGpsForRoute: 'Waiting for a GPS fix before routing.',
    arrived: 'You have arrived', rerouting: 'Recalculating route…',
    gpxLoaded: 'GPX loaded: {n} points', gpxError: 'Could not read GPX file.',
    comingSoon: 'Not available in this version.',
    // Turn instructions
    turn_left: 'Turn left', turn_right: 'Turn right', turn_slight_left: 'Bear left', turn_slight_right: 'Bear right',
    turn_sharp_left: 'Sharp left', turn_sharp_right: 'Sharp right', uturn: 'Make a U-turn', straight: 'Continue straight',
    depart: 'Head out', arrive: 'Arrive at destination', merge: 'Merge', on_ramp: 'Take the ramp', off_ramp: 'Take the exit',
    fork_left: 'Keep left', fork_right: 'Keep right', end_of_road_left: 'Turn left at the end of the road', end_of_road_right: 'Turn right at the end of the road',
    roundabout: 'At the roundabout take exit {n}', roundabout_plain: 'Enter the roundabout',
    inDistance: 'In {d}, {i}', onto: 'onto {r}', then: 'then',
    m: 'm', km: 'km', ft: 'ft', mi: 'mi', kmh: 'km/h', mph: 'mph', ms2: 'm/s²',
    hmm: '{h}h {m}m',
  },
  it: {
    appTitleA: 'MOTO', appTitleB: 'SPEED',
    start: 'Avvia', stop: 'Stop', reset: 'Azzera',
    resetConfirm: 'Azzerare le statistiche della sessione corrente?',
    stopConfirm: 'Terminare e salvare questa sessione?',
    time: 'TEMPO', arrival: 'ARRIVO', total: 'TOTALE', remaining: 'RIMANE',
    speed: 'VELOCITÀ', max: 'MAX',
    avgSpeed: 'Ø MEDIA', maxAccel: 'MAX ACC', maxBrake: 'FRENATA MAX', brakeDist: 'SPAZIO FRENATA',
    cal: 'CAL', calibrating: 'CAL…', calibrated: 'Angolo di piega calibrato',
    enableSensors: 'Tocca per attivare il sensore di piega',
    sensorsDenied: 'Permesso sensori di movimento negato. Attivalo in Impostazioni › Safari › Movimento e orientamento.',
    gpsWaiting: 'In attesa del GPS…', gpsDenied: 'Permesso posizione negato.',
    gpsAcc: 'GPS ±{n} m',
    menu: 'Menu', settings: 'Impostazioni', history: 'Storico sessioni', navigator: 'Navigatore', done: 'Fine',
    close: 'Chiudi', cancel: 'Annulla', select: 'Seleziona', delete: 'Elimina', share: 'Condividi', back: 'Indietro',
    theme: 'TEMA', panelColor: 'Colore pannelli',
    colorOrange: 'Arancio', colorRed: 'Rosso', colorBlue: 'Blu', colorGreen: 'Verde', colorYellow: 'Giallo', colorWhite: 'Bianco', colorPurple: 'Viola',
    leanSection: 'ANGOLO DI PIEGA', phonePos: 'Posizione telefono',
    posFrame: 'Telaio / Serbatoio', posBars: 'Manubrio', posBag: 'Borsa serbatoio',
    posHint: 'Il telefono è fissato al manubrio: la sterzata contamina leggermente la lettura della piega a bassa velocità. Calibra con la moto dritta e il manubrio al centro.',
    posHintFrame: 'Il telefono è fissato al telaio o al serbatoio: la piega viene letta direttamente dal telaio. Calibra con la moto dritta.',
    invertLean: 'Inverti sinistra/destra', autoCal: 'Calibrazione automatica alla prima lettura',
    language: 'LINGUA', lang: 'Lingua', units: 'UNITÀ', unitSystem: 'Sistema di unità', metric: 'Metrico (km/h)', imperial: 'Imperiale (mph)',
    navigation: 'NAVIGAZIONE', voiceGuidance: 'Annunci vocali', testVoice: 'Testa co-pilota',
    testVoiceText: 'Co-pilota pronto. Buon viaggio.',
    mapSection: 'MAPPA', mapStyle: 'Stile mappa', mapLight: 'Chiaro', mapDark: 'Scuro', mapFollow: 'Segui posizione',
    display: 'SCHERMO', keepAwake: 'Schermo sempre acceso', demoMode: 'Modalità demo (giro simulato)',
    demoHint: 'Simula GPS e piega per vedere il cruscotto funzionare al chiuso.',
    data: 'DATI', clearHistory: 'Elimina tutte le sessioni', clearConfirm: 'Eliminare tutte le sessioni salvate? Operazione irreversibile.',
    about: 'INFO', version: 'Versione',
    noSessions: 'Nessuna sessione. Tocca ▶ per registrare un giro.',
    deleteN: 'Elimina ({n})', deleteConfirm: 'Eliminare {n} sessione/i?',
    sessionDetail: 'Sessione', duration: 'Durata', distance: 'Distanza', movingTime: 'Tempo in movimento',
    exportGpx: 'Esporta GPX',
    searchDest: 'Cerca destinazione…', searching: 'Ricerca…', noResults: 'Nessun risultato.',
    enterDest: 'Inserisci una destinazione per calcolare il percorso.',
    avoidTolls: 'Evita pedaggi', avoidTollsSub: 'Evita strade con casello',
    avoidMotorways: 'Evita autostrade', avoidMotorwaysSub: 'Preferisce strade statali e provinciali',
    avoidFerries: 'Evita traghetti', avoidFerriesSub: 'Percorso solo su strade terrestri',
    savePlace: 'Salva luogo', favorites: 'Preferiti', loadGpx: 'Carica GPX', motoRoutes: 'Percorsi moto',
    fuel: 'Benzinai', restaurants: 'Ristoranti', hotels: 'Hotel', parking: 'Parcheggi',
    savePlacePrompt: 'Nome per questo luogo:', currentLocation: 'Posizione attuale', noFavorites: 'Nessun luogo salvato.',
    nearby: 'Nelle vicinanze', routing: 'Calcolo percorso…', routeError: 'Impossibile calcolare il percorso.',
    routeTo: 'Percorso per', startNav: 'Avvia navigazione', endNav: 'Termina navigazione', endNavConfirm: 'Terminare la navigazione?',
    noGpsForRoute: 'In attesa del segnale GPS prima di calcolare.',
    arrived: 'Sei arrivato a destinazione', rerouting: 'Ricalcolo percorso…',
    gpxLoaded: 'GPX caricato: {n} punti', gpxError: 'Impossibile leggere il file GPX.',
    comingSoon: 'Non disponibile in questa versione.',
    turn_left: 'Svolta a sinistra', turn_right: 'Svolta a destra', turn_slight_left: 'Tieni la sinistra', turn_slight_right: 'Tieni la destra',
    turn_sharp_left: 'Svolta secca a sinistra', turn_sharp_right: 'Svolta secca a destra', uturn: 'Inversione a U', straight: 'Prosegui dritto',
    depart: 'Parti', arrive: 'Arrivo a destinazione', merge: 'Immettiti', on_ramp: 'Prendi la rampa', off_ramp: "Prendi l'uscita",
    fork_left: 'Mantieni la sinistra', fork_right: 'Mantieni la destra', end_of_road_left: 'A fine strada svolta a sinistra', end_of_road_right: 'A fine strada svolta a destra',
    roundabout: 'Alla rotonda prendi la {n}ª uscita', roundabout_plain: 'Entra nella rotonda',
    inDistance: 'Tra {d}, {i}', onto: 'su {r}', then: 'poi',
    m: 'm', km: 'km', ft: 'ft', mi: 'mi', kmh: 'km/h', mph: 'mph', ms2: 'm/s²',
    hmm: '{h}h {m}m',
  },
};

let current = 'en';

export function setLang(l) { current = STRINGS[l] ? l : 'en'; document.documentElement.lang = current; }
export function getLang() { return current; }
export function t(key, vars) {
  let s = (STRINGS[current] && STRINGS[current][key]) ?? STRINGS.en[key] ?? key;
  if (vars) for (const k of Object.keys(vars)) s = s.replace(`{${k}}`, vars[k]);
  return s;
}
export function speechLang() { return current === 'it' ? 'it-IT' : 'en-US'; }
export function detectLang() { return (navigator.language || 'en').toLowerCase().startsWith('it') ? 'it' : 'en'; }

// Apply translations to any element with data-i18n="key" (text) or data-i18n-ph="key" (placeholder).
export function applyDom(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
}
