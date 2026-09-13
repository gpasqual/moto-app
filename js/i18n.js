// Two languages: English and Italian (the reference app is Italian).
const STRINGS = {
  en: {
    appTitleA: 'MOTO', appTitleB: 'NG',
    start: 'Start', stop: 'Stop', reset: 'Reset',
    resetConfirm: 'Reset the current session stats?',
    stopTitle: 'Stop recording?', saveSession: 'Save session', discard: 'Discard', keepRecording: 'Keep recording',
    sessionSaved: 'Session saved', sessionDiscarded: 'Session discarded', saveFailed: 'Could not save the session',
    yesReset: 'Reset', yesEnd: 'End navigation', yesDelete: 'Delete', yesDeleteAll: 'Delete all',
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
    about: 'ABOUT', version: 'Version', aboutApp: 'About MOTO-NG', shareLink: 'Share link', copyLink: 'Copy link', copied: 'Link copied', sourceCode: 'Source code',
    // History
    noSessions: 'No sessions yet. Tap ▶ to start recording a ride.',
    deleteN: 'Delete ({n})', deleteConfirm: 'Delete {n} session(s)?',
    sessionDetail: 'Session', duration: 'Duration', distance: 'Distance', movingTime: 'Moving time',
    exportGpx: 'Export GPX', exportData: 'Export data (for video overlay)', exporting: 'Preparing export…', analytics: 'Analytics',
    chSpeed: 'Speed', chLean: 'Lean', chLong: 'Long. accel', chLat: 'Lat. accel', chVert: 'Vert. accel', chRoll: 'Roll rate', chPitch: 'Pitch rate', chYaw: 'Yaw rate',
    anHint: 'Drag to pan · pinch or scroll to zoom · tap for values · double-tap to reset', srcImu: 'IMU {n} Hz', srcGps: 'GPS-derived', smoothing: 'Smoothing', raw: 'Raw',
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
    appTitleA: 'MOTO', appTitleB: 'NG',
    start: 'Avvia', stop: 'Stop', reset: 'Azzera',
    resetConfirm: 'Azzerare le statistiche della sessione corrente?',
    stopTitle: 'Terminare la registrazione?', saveSession: 'Salva sessione', discard: 'Scarta', keepRecording: 'Continua a registrare',
    sessionSaved: 'Sessione salvata', sessionDiscarded: 'Sessione scartata', saveFailed: 'Impossibile salvare la sessione',
    yesReset: 'Azzera', yesEnd: 'Termina navigazione', yesDelete: 'Elimina', yesDeleteAll: 'Elimina tutto',
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
    about: 'INFO', version: 'Versione', aboutApp: 'Info su MOTO-NG', shareLink: 'Condividi link', copyLink: 'Copia link', copied: 'Link copiato', sourceCode: 'Codice sorgente',
    noSessions: 'Nessuna sessione. Tocca ▶ per registrare un giro.',
    deleteN: 'Elimina ({n})', deleteConfirm: 'Eliminare {n} sessione/i?',
    sessionDetail: 'Sessione', duration: 'Durata', distance: 'Distanza', movingTime: 'Tempo in movimento',
    exportGpx: 'Esporta GPX', exportData: 'Esporta dati (per overlay video)', exporting: 'Preparazione export…', analytics: 'Analisi',
    chSpeed: 'Velocità', chLean: 'Piega', chLong: 'Acc. longitudinale', chLat: 'Acc. laterale', chVert: 'Acc. verticale', chRoll: 'Vel. rollio', chPitch: 'Vel. beccheggio', chYaw: 'Vel. imbardata',
    anHint: 'Trascina per spostare · pizzica o scorri per zoomare · tocca per i valori · doppio tocco per reimpostare', srcImu: 'IMU {n} Hz', srcGps: 'derivato da GPS', smoothing: 'Media mobile', raw: 'Grezzo',
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

// About screen content. Each section: { h: heading, p: [paragraphs], li: [bullets], kv: [[label, text]] }.
const ABOUT = {
  en: {
    tagline: 'Motorcycle dashboard that runs entirely on your phone. No account, no server, no app store.',
    install: {
      h: 'Install & share',
      p: ['Anyone can use MOTO-NG: send them the link or let them scan the code above.'],
      li: [
        'iPhone: open the link in Safari → Share → "Add to Home Screen".',
        'Android: open in Chrome → menu → "Install app".',
        'Launch it from the home-screen icon — it runs full screen.',
      ],
    },
    offline: {
      h: 'On the road',
      p: ['It does not need a PC or a signal to work as a dashboard.'],
      kv: [
        ['Works offline', 'speed, lean angle, acceleration & braking stats, session recording, history, GPX export, opening the app.'],
        ['Needs mobile data', 'new map tiles, destination search, route calculation, re-routing, nearby places. A route already calculated keeps guiding you through short signal gaps.'],
        ['Foreground only', 'like every web app it pauses when the screen locks or you switch apps. "Keep screen on" is enabled by default; plug in for long rides.'],
      ],
    },
    privacy: {
      h: 'Your data',
      li: [
        'Sessions, history, favourites and calibration are stored only on this phone.',
        'Nobody — including the author — can see your rides. A GPX file leaves the phone only when you share it.',
        'Search text and your position are sent to the map services only when you search or calculate a route, as with any map app.',
      ],
    },
    firstRide: {
      h: 'First ride checklist',
      li: [
        'Mount the phone, then set Settings › Phone position (Handlebar or Frame/Tank).',
        'With the bike upright and the bars straight, tap CAL. It is remembered; re-CAL if you move the mount.',
        'Tap ▶ to record a session, ■ to stop and save it. ⟳ zeroes the live stats.',
        'If the gauge leans the wrong way on your mount, use Settings › Invert left/right.',
        'Tap ⤢ on the map for full-screen map with a speed/lean pill — best when navigating.',
        'You can mount the phone in landscape: the lean reference follows the screen orientation. Re-CAL whenever you move the mount.',
        'After a ride, open the session and tap Analytics for the speed / lean / accelerometer / gyro time history.',
      ],
    },
    numbers: {
      h: 'How the numbers are computed',
      kv: [
        ['Speed', 'GPS Doppler speed; max is the session peak.'],
        ['Ø AVG', 'distance ÷ moving time (time above 3.6 km/h).'],
        ['MAX ACC / MAX BRAKE', 'change of GPS speed per second, lightly smoothed, glitches rejected.'],
        ['BRAKE DIST', 'metres covered during the hardest braking event of the session.'],
        ['Lean', 'phone attitude (gyro + accelerometer fused by the OS) → roll about the bike\'s forward axis, relative to the CAL reference. Right is positive. Very long sweeping corners may drift a few degrees toward zero — a limit of phone sensors.'],
      ],
    },
    services: {
      h: 'Map & routing services',
      p: ['Free public OpenStreetMap services, used directly from the phone: OSM map tiles, Nominatim (search), the OSRM demo router, Overpass (nearby places).',
          'They are meant for light, personal use — fine for you and your riding friends, not for large-scale distribution. Map data © OpenStreetMap contributors.'],
    },
    credits: { h: 'Credits', p: ['Built with Leaflet and qrcode-generator (MIT). Dashboard design inspired by the MOTO SPEED app.'] },
  },
  it: {
    tagline: 'Cruscotto moto che gira interamente sul tuo telefono. Nessun account, nessun server, nessun app store.',
    install: {
      h: 'Installa e condividi',
      p: ['Chiunque può usare MOTO-NG: mandagli il link o fagli inquadrare il codice qui sopra.'],
      li: [
        'iPhone: apri il link in Safari → Condividi → "Aggiungi alla schermata Home".',
        'Android: apri in Chrome → menu → "Installa app".',
        "Avviala dall'icona nella Home: gira a schermo intero.",
      ],
    },
    offline: {
      h: 'In viaggio',
      p: ['Non serve un PC né il segnale per funzionare come cruscotto.'],
      kv: [
        ['Funziona offline', 'velocità, angolo di piega, accelerazione e frenata, registrazione sessioni, storico, esportazione GPX, avvio dell\'app.'],
        ['Serve la rete', 'nuove tessere della mappa, ricerca destinazioni, calcolo percorso, ricalcolo, luoghi nelle vicinanze. Un percorso già calcolato continua a guidarti anche senza segnale per brevi tratti.'],
        ['Solo in primo piano', 'come ogni web app si ferma se blocchi lo schermo o cambi app. "Schermo sempre acceso" è attivo di default; collega il telefono alla corrente nei giri lunghi.'],
      ],
    },
    privacy: {
      h: 'I tuoi dati',
      li: [
        'Sessioni, storico, preferiti e calibrazione restano solo su questo telefono.',
        "Nessuno — nemmeno l'autore — vede i tuoi giri. Un file GPX esce dal telefono solo quando lo condividi.",
        'Testo di ricerca e posizione vengono inviati ai servizi mappa solo quando cerchi o calcoli un percorso, come in qualsiasi app di mappe.',
      ],
    },
    firstRide: {
      h: 'Prima uscita',
      li: [
        'Monta il telefono, poi imposta Impostazioni › Posizione telefono (Manubrio o Telaio/Serbatoio).',
        'Con la moto dritta e il manubrio al centro tocca CAL. Resta memorizzato; rifai CAL se sposti il supporto.',
        'Tocca ▶ per registrare una sessione, ■ per terminarla e salvarla. ⟳ azzera le statistiche.',
        'Se la piega risulta invertita sul tuo supporto, usa Impostazioni › Inverti sinistra/destra.',
        'Tocca ⤢ sulla mappa per la mappa a schermo intero con velocità e piega: ideale in navigazione.',
        "Puoi montare il telefono in orizzontale: il riferimento della piega segue l'orientamento dello schermo. Rifai CAL ogni volta che sposti il supporto.",
        "Dopo il giro, apri la sessione e tocca Analisi per l'andamento nel tempo di velocità, piega, accelerometro e giroscopio.",
      ],
    },
    numbers: {
      h: 'Come vengono calcolati i valori',
      kv: [
        ['Velocità', 'velocità Doppler del GPS; il MAX è il picco della sessione.'],
        ['Ø MEDIA', 'distanza ÷ tempo in movimento (sopra 3,6 km/h).'],
        ['MAX ACC / FRENATA MAX', 'variazione della velocità GPS al secondo, leggermente filtrata, con scarto degli errori.'],
        ['SPAZIO FRENATA', 'metri percorsi durante la frenata più forte della sessione.'],
        ['Piega', "assetto del telefono (giroscopio + accelerometro fusi dal sistema) → rollio attorno all'asse di marcia rispetto al riferimento CAL. Destra positiva. Nelle curve molto lunghe può derivare di qualche grado verso zero: è un limite dei sensori del telefono."],
      ],
    },
    services: {
      h: 'Servizi mappa e percorsi',
      p: ['Servizi pubblici gratuiti di OpenStreetMap, usati direttamente dal telefono: tessere OSM, Nominatim (ricerca), router demo OSRM, Overpass (luoghi vicini).',
          'Sono pensati per un uso leggero e personale: vanno bene per te e i tuoi amici motociclisti, non per una distribuzione su larga scala. Dati mappa © OpenStreetMap contributors.'],
    },
    credits: { h: 'Crediti', p: ['Realizzata con Leaflet e qrcode-generator (MIT). Design del cruscotto ispirato all\'app MOTO SPEED.'] },
  },
};
export function aboutContent() { return ABOUT[current] || ABOUT.en; }
