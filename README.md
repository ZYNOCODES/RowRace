# RowRace 3D

A 3D indoor rowing race app for Android tablets mounted on Concept2 rowers with a PM5 monitor.
It connects to the PM5 over Bluetooth LE and turns each workout into a race on water.

The product name lives in one place: `shared/constants.js` (`APP_NAME`).

> Work in progress. See `docs/PROGRESS.md` for what is done in each phase.

## Layout

```
/app        Expo React Native app (dev client, expo-router, zustand, three.js)
/simulator  Node.js BLE peripheral that emulates a PM5 on Linux (see simulator/README.md)
/shared     Pure JS: PM5 protocol encode/decode, enums, CSAFE, physics
/docs       Spec PDF, protocol notes, progress, checklists
```

```
        PM5 (real)  ──BLE──┐
  PC simulator (bleno) ─BLE─┤
                           ▼
 ┌────────────── app ──────────────────────────────┐
 │ data sources: pm5.js │ mockPM5.js │ replay.js   │──► logger (JSONL)
 │        └──── shared/decode.js ────┘             │
 │                   ▼ normalized samples          │
 │             race engine (pure JS)               │
 │                   ▼                             │
 │          3D scene + HUD + screens               │
 └─────────────────────────────────────────────────┘
```

## Setup

Requirements: Node 20+ and npm 10+. For device builds you also need the Android SDK (or EAS).

```bash
npm install
```

## Scripts

| Command                     | What it does                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `npm test`                  | Jest: shared protocol, theme, i18n, and later the race engine                      |
| `npm run lint`              | ESLint                                                                             |
| `npm run format`            | Prettier                                                                           |
| `npm start`                 | Dev server for the **RowRace dev client** (Bluetooth works). Same as `npm run app` |
| `npm run start:go`          | Dev server for **Expo Go** (no Bluetooth: use the in-app simulator or replay)      |
| `npm run app`               | Expo dev server for the dev client                                                 |
| `npm run app:android`       | Build and install the dev client on a connected Android device                     |
| `npm run sim`               | PC PM5 simulator over Bluetooth (setup: `simulator/README.md`)                     |
| `npm run preview:scene`     | Web preview of the 3D scene (same builders as the app) at http://localhost:8765    |
| `npm run characters`        | Convert character FBX/GLB files into the app's library (see `docs/CHARACTERS.md`)  |
| `npm run characters:thumbs` | Render character thumbnails (needs Chrome)                                         |
| `npm run sim:dry`           | Simulator without Bluetooth: prints the packets it would send                      |

Bluetooth doesn't work in Expo Go. Install the dev client once (`npm run build:dev -w app`), then use `npm start` and hot reload works just like Expo Go.
Always start the dev server with these scripts (root or `app/`). A plain `npx expo start` at the repo root serves the wrong project, and the dev client fails with `Unable to resolve module ./_expo/loading`.

## Replay a client log through the simulator

```bash
npm run sim -- --replay path/to/session-<date>.jsonl --speed 2
```

The app connects to it like a real PM5 and receives the client's exact packets with their original timing.

## Data sources

| Source               | What it is                     | When to use                                                             |
| -------------------- | ------------------------------ | ----------------------------------------------------------------------- |
| Real PM5 (Bluetooth) | `app/src/data/pm5.js`          | The client's machine, **and the PC simulator** (it advertises as a PM5) |
| Simulator (in-app)   | `app/src/data/mockPM5.js`      | UI work without Bluetooth, even in an emulator. 10 scenarios            |
| Replay log           | `app/src/data/replaySource.js` | Reproduce a client session on the tablet (×1/×2/×4)                     |

All three go through the same decoder (`PacketSource.handlePacket`).
Switching: **Settings → tap the version number 7 times** turns on developer options (also in client builds). Then choose the data source in Settings, or in Diagnostics → Developer options (with scenario, replay file and speed).

## Logs

- The app writes `documents/logs/session-<ISO>.jsonl`: one file per app session, the last 20 kept, 10 MB max per file.
- **Diagnostics → Share logs** zips them and opens the share sheet (WhatsApp, email…). **Mark event** adds a `note` line.
- Read a log with any text tool, e.g. `grep '"type":"note"' session-*.jsonl` or `jq -c 'select(.type=="ble")' session-*.jsonl`.
- Replay it on the PC: `npm run sim -- --replay session-….jsonl`. Or on the tablet: Diagnostics → Developer options → Replay log → Choose a log file.

## Building the dev client (Bluetooth needs it)

```bash
cd app && npx eas-cli login && npm run build:dev
```

Or, with Android Studio installed and the tablet on USB: `npm run app:android`. Then `npm run app` starts the dev server.
