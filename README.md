# MOTO-NG — motorcycle dashboard PWA

A personal riding dashboard that runs as an installable web app on the phone (iPhone or Android).
Live at **https://gpasqual.github.io/moto-app/**. Dashboard design inspired by the "MOTO SPEED" iOS app.

**Live data**
- Speed (GPS), session max, moving average
- Max acceleration, max braking (m/s²), braking distance of the hardest brake
- Lean angle gauge (±60°) with left/right session maxes and calibration
- Map with heading arrow, track of the current session, follow / free-look, full-screen mode

**Features**
- Session recording (▶ / ■) with history, per-session detail map, GPX export/share, multi-select delete
- Navigator: destination search, route with avoid tolls / motorways / ferries, turn-by-turn banner
  with voice announcements, re-routing, ETA + remaining, favourites, nearby fuel/food/hotels/parking, GPX import
- Settings: panel colour, phone mount position, invert L/R, language (EN/IT), km/h / mph,
  voice on/off, map light/dark, keep screen on, demo mode
- About screen (Settings › About) with install/share QR code, offline/online behaviour, privacy, first-ride checklist
- Works offline for the dashboard (map tiles and routing need data)

No accounts, no keys, no backend. Everything is stored on the phone (IndexedDB / localStorage).

---

## 1. Run it locally (for a look on the PC)

Any static file server works. From this folder:

```bash
python -m http.server 8765
```

Open <http://localhost:8765>. Turn on **Settings › Demo mode** to see the dashboard driven by a simulated ride.

## 2. Put it on the phone

The phone needs the app over **HTTPS** (GPS and motion sensors are blocked on plain http). The easiest free
host is GitHub Pages:

1. Create a new repository on GitHub (e.g. `moto-app`, can be private).
2. Push this folder to it:
   ```bash
   git init
   git add .
   git commit -m "MOTO-NG PWA"
   git branch -M main
   git remote add origin https://github.com/<you>/moto-app.git
   git push -u origin main
   ```
3. On GitHub: **Settings › Pages › Source: Deploy from a branch › `main` / (root)**. After a minute the app is at
   `https://<you>.github.io/moto-app/`.

Alternatives: Netlify Drop (drag the folder onto app.netlify.com/drop) or Cloudflare Pages.

### Install on iPhone
1. Open the URL in **Safari**.
2. Share ▸ **Add to Home Screen**. Launch it from the icon (runs full screen, no browser chrome).
3. First run: allow **Location** when asked; tap the gauge ("Tap to enable lean sensor") or ▶ and allow **Motion & Orientation**.
   If you tapped "Don't allow" by mistake: iOS Settings › Safari › *Motion & Orientation Access* / *Location*.

### Install on Android
Open in Chrome → menu → **Install app** (or "Add to Home screen").

## 3. Riding with it

- **Mount the phone**, then set **Settings › Phone position** to where it lives (Handlebar or Frame/Tank).
- With the bike **upright and the bars straight**, tap **CAL**. The calibration is remembered; re-CAL if you move the mount.
- Tap **▶** to start recording a session, **■** to stop and save it. The ⟳ button zeros the live stats.
- Tap **⤢** on the map for full-screen map + speed/lean pill (best with navigation).
- Keep the app in the **foreground** while riding. Like any web app it cannot record GPS in the background;
  *Keep screen on* is enabled by default so the display stays awake.

### How the numbers are computed
| Value | Method |
|---|---|
| Speed | GPS Doppler speed (`coords.speed`), falling back to distance/time between fixes |
| Ø AVG | distance ÷ moving time (time with speed > 3.6 km/h) |
| MAX ACC / MAX BRAKE | derivative of GPS speed, 2-sample smoothed, glitches > 15 m/s² rejected |
| BRAKE DIST | distance covered during the hardest braking event (decel ≥ 1 m/s² until it eases below 0.3 m/s²) |
| Lean | sensor-fused device attitude (gyro+accel) → world-down vector in phone axes → signed roll about the bike's forward axis relative to the CAL reference. Right = positive. |

Lean uses the phone's fused attitude rather than the raw accelerometer, because in a balanced corner the raw
accelerometer points along the bike and would read ~0°. Very long sustained corners can still drift a few degrees
toward zero — that is a limit of phone sensors, not the maths.

## 4. Project layout

```
index.html              markup + inline SVG icon sprite
css/app.css             theme (accent colours via [data-accent]), layout, sheets
js/app.js               controller: GPS, sensors, session lifecycle, UI, settings, history, navigator
js/telemetry.js         Session stats from GPS fixes; RideSimulator for demo mode
js/lean.js              LeanEstimator (orientation → lean angle, calibration, mount handling)
js/gauge.js             SVG lean dial
js/map.js               Leaflet wrapper (position, track, route, POIs, light/dark)
js/nav.js               Nominatim geocoding, OSRM routing, guidance + voice, Overpass POIs, GPX
js/storage.js           settings/favourites (localStorage), sessions (IndexedDB)
js/i18n.js              EN / IT strings
sw.js                   service worker (network-first app shell, offline fallback)
manifest.webmanifest    PWA manifest; icons/ generated PNGs
vendor/leaflet/         Leaflet 1.9.4 (vendored, works offline)
vendor/qrcode/          qrcode-generator 1.4.4 (About-screen QR code)
reference/              screenshots of the app this one resembles
```

External services used (all free, no key): OpenStreetMap tiles, Nominatim (search), OSRM demo router,
Overpass API (nearby places). They are public demo services with fair-use limits — fine for one rider.
