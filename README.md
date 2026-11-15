# RowRace 3D

A 3D indoor rowing race app for **Android tablets mounted on Concept2 rowers with a PM5**. It connects to the PM5 over **Bluetooth LE**, reads every stroke live, and turns each workout into a race on water against pace boats and your personal best.

The product name lives in one place: `shared/constants.js` (`APP_NAME`). Progress per phase is in `docs/PROGRESS.md`.

## Architecture

```
 Concept2 PM5 ──BLE──┐            ┌── PC simulator (bleno, Linux) ──BLE──┐
                     ▼            ▼                                      │
 ┌──────────────────────────── app (Expo, React Native, JS) ────────────┼──┐
 │ data/  pm5.js (BLE) │ mockPM5.js (no BLE) │ replaySource.js (logs)    │  │
 │          └──────────── PacketSource ─────────────┘                    │  │
 │        decode (shared/pm5) → sampleMerger → sample / stroke / status  │  │
 │                      │                         └──► logging/ (JSONL) ─┘  │
 │                      ▼                                                    │
 │ race/  RaceEngine (pure JS): clock, baselines, resets, pauses, boats     │
 │                      ▼                                                    │
 │ scene/ three.js world (sky, water, course, boats, characters) ◄─ R3F      │
 │ app/ + components/hud/  screens, HUD, voice, results, history             │
 └───────────────────────────────────────────────────────────────────────────┘
 shared/   PM5 protocol encode/decode, enums, CSAFE, physics, rower model (also used by the simulator)
```

```
/app        Expo app (dev client, expo-router, zustand, three.js via @react-three/fiber/native)
/simulator  Node BLE peripheral that emulates a PM5 on Linux (simulator/README.md)
/shared     Pure JS shared by app + simulator (protocol, physics, sim model, log format)
/tools      Dev tools: scene preview, character pipeline, icons, sounds
/docs       Spec PDF, protocol notes, progress, checklists, release notes
```

## Setup

Node 20+ and npm 10+.

```bash
npm install
```

Bluetooth doesn't work in Expo Go. Build the **dev client** once (EAS cloud), install it on the tablet, then use `npm start`, which hot-reloads like Expo Go:

```bash
cd app && npx eas-cli login && npm run build:dev
```

Always start the dev server with these scripts (root or `app/`). A plain `npx expo start` at the repo root serves the wrong project, and the dev client fails with `Unable to resolve module ./_expo/loading`.

## Scripts

| Command                                                           | What it does                                                               |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `npm start`                                                       | Dev server for the RowRace dev client (Bluetooth works)                    |
| `npm run start:go`                                                | Dev server for Expo Go (no Bluetooth: use the simulator or replay sources) |
| `npm test`                                                        | Jest: protocol, engine, scene budget, simulator, end-to-end reconnection   |
| `npm run lint` / `npm run format`                                 | ESLint / Prettier                                                          |
| `npm run sim`                                                     | PC PM5 simulator over Bluetooth (`simulator/README.md`)                    |
| `npm run sim:dry`                                                 | Simulator without Bluetooth (prints packets)                               |
| `npm run preview:scene`                                           | Web preview of the 3D scene at http://localhost:8765                       |
| `npm run characters` / `characters:thumbs` / `characters:publish` | Character library pipeline (`docs/CHARACTERS.md`)                          |
| `npm run brand`                                                   | Regenerate icon, adaptive icon and splash from code                        |
| `npm run apk`                                                     | Build the client APK (EAS "preview" profile)                               |

## Data sources

| Source               | What it is                     | When to use                                                             |
| -------------------- | ------------------------------ | ----------------------------------------------------------------------- |
| Real PM5 (Bluetooth) | `app/src/data/pm5.js`          | The client's machine, **and the PC simulator** (it advertises as a PM5) |
| Simulator (in-app)   | `app/src/data/mockPM5.js`      | UI work without Bluetooth, even in Expo Go. 10 scenarios                |
| Replay log           | `app/src/data/replaySource.js` | Reproduce a client session on the tablet (×1/×2/×4)                     |

All three go through the same decoder. **Settings → tap the version 7 times** turns on developer options (also in client builds). Then pick the source in Settings, or in Diagnostics → Developer options (scenario, replay file, speed).

## Logs

- One JSONL file per app session in `documents/logs/` (last 20 kept, 10 MB max each). Line types: `meta`, `ble`, `packet`, `race`, `ui`, `note`, `error`.
- **Diagnostics → Share logs** zips them; **Mark event** adds a `note` line.
- Read them with any text tool:
  ```bash
  jq -c 'select(.type=="race" or .type=="note")' session-*.jsonl
  ```
- **Replay a client log on the PC simulator** (the app connects to it like a real PM5):
  ```bash
  npm run sim -- --replay path/to/session-….jsonl --speed 2
  ```
- Or on the tablet: Diagnostics → Developer options → Replay log → Choose a log file.

## Delivery

1. Bump `buildNumber` (and `version` if needed) in `app/package.json`.
2. `npm test && npm run lint`.
3. `npm run apk`, then send the APK link plus `docs/CLIENT_TEST_CHECKLIST.md` (EN/FR).
4. Add an entry to `docs/RELEASE_NOTES.md`.

Manual reconnection test against the PC simulator: `docs/RECONNECTION_TEST.md`.
