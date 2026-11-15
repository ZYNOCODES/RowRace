# Release notes

Each APK sent to the client gets an entry here. Bump `buildNumber` in `app/package.json` first
(Android refuses to update an app to a lower or equal versionCode), then build:

```bash
npm run apk        # EAS cloud build, profile "preview" → installable .apk
```

## 0.1.0 (build 1): first client test build

**What to test:** the full flow on the real Concept2 PM5. Follow `docs/CLIENT_TEST_CHECKLIST.md` and send back the logs (Diagnostics → Share logs).

**Included**

- Bluetooth connection to the PM5:
  - finds the PM5 by name and remembers the last one;
  - reconnects automatically (1, 2, 4, 8 s, then every 10 s);
  - handles the PM5 being reset mid-race, Bluetooth being turned off and on, and walking out of range.
- Races against pace boats (target pace ±5 s) and your personal best, by distance or by time; Free Row.
- 3D scene, three maps (Alpine Lake, Desert Oasis, Night Regatta), chase/side/overhead cameras, stroke-synced rower; 4 selectable rowers.
- Race display:
  - time, distance, speed, calories, pace gauge with watts, stroke rate, heart rate;
  - rank and gaps to the boats ahead and behind;
  - voice countdown and 500 m splits (EN/FR/AR), start horn, vibrations.
- Results with a pace chart, splits and personal bests; history of every session.
- Diagnostics: live packets, Mark event, Share logs. Developer options: 7 taps on the version number in Settings.

**Known limits**

- The 3D characters and scenery are placeholders; final art comes later.
- Arabic voice needs an Arabic text-to-speech voice on the tablet (Settings → Text-to-speech on Android).
- Characters other than the 4 built-in ones aren't hosted yet ("Coming soon").

**Install on the tablet**

1. Open the link from the EAS build page on the tablet and download the `.apk`.
2. Allow "Install unknown apps" for the browser or Files app when Android asks.
3. Install, open, and follow the checklist.
