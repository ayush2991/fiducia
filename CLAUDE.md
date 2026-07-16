# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Fiducia is a React Native app (Expo, TypeScript) for comparing investment portfolios, targeting both iOS and Android. The codebase is currently a fresh Expo scaffold — `App.tsx` is the sole entry point rendered via `index.ts` (`registerRootComponent`). No navigation, state management, or data layer has been added yet.

## Commands

- `npm start` — start the Expo dev server (Metro); scan the QR code with Expo Go or press `i`/`a` in the terminal.
- `npm run ios` — start the dev server and launch the iOS simulator.
- `npm run android` — start the dev server and launch the Android emulator.
- `npm run web` — start the dev server for web.
- `npx tsc --noEmit` — type-check the project (there is no separate `lint`/`test`/`build` script defined yet).

## Important: Expo SDK version

This project is on **Expo SDK 57**, which is a recent major version with breaking changes from prior SDKs. Before writing Expo-related code (config, APIs, plugins), consult the versioned docs at https://docs.expo.dev/versions/v57.0.0/ rather than relying on general Expo knowledge, since APIs and conventions may have changed.

## Native projects

There are no checked-in `ios/`/`android/` native directories — this is a managed Expo workflow (`.gitignore` explicitly excludes `/ios` and `/android`). Don't hand-edit native project files; use `app.json` (Expo config) and Expo config plugins instead. If bare native code becomes necessary, it would require `expo prebuild`.
