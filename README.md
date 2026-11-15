# RowRace 3D

A 3D indoor rowing race app for Android tablets mounted on Concept2 rowers with a PM5 monitor.
It connects to the PM5 over Bluetooth LE and turns each workout into a race on water.

The product name lives in one place: `shared/constants.js` (`APP_NAME`).

> Work in progress. See `docs/PROGRESS.md` for what is done in each phase.

## Layout

```
/app        Expo React Native app (dev client, expo-router, zustand, three.js)
/simulator  Node.js BLE peripheral that emulates a PM5 on Linux (phase 2)
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

| Command               | What it does                                                   |
| --------------------- | -------------------------------------------------------------- |
| `npm test`            | Jest: shared protocol, theme, i18n, and later the race engine  |
| `npm run lint`        | ESLint                                                         |
| `npm run format`      | Prettier                                                       |
| `npm run app`         | Expo dev server for the dev client                             |
| `npm run app:android` | Build and install the dev client on a connected Android device |
| `npm run sim`         | PC PM5 simulator (phase 2)                                     |

Bluetooth doesn't work in Expo Go, so use a dev client build (`npm run app:android` once, then `npm run app`).
