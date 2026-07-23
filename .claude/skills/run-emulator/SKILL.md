---
name: run-emulator
description: Launch fiducia (this Expo/React Native app) on the Android emulator or iOS Simulator and verify it actually rendered, via CLI/AppleScript rather than opening Xcode or Android Studio by hand. Use whenever the user asks to run, start, launch, or screenshot the app on the Android emulator, iOS Simulator, or just "the simulator"/"the emulator", or wants to confirm a code change shows up correctly on device. This project has no checked-in ios/android native folders (managed Expo workflow via Expo Go), so the usual `npx expo run:ios`/`react-native run-android` native-build flow doesn't apply here — read this skill instead of assuming that flow.
---

# Running fiducia on the Android emulator or iOS Simulator

This is a managed Expo project (no `ios/`/`android/` native dirs — see
CLAUDE.md "Native projects"). The app runs inside **Expo Go**, driven
by a Metro dev server. "Running the app" means: get a
simulator/emulator booted, get Metro serving, get Expo Go to open the
project's bundle, then actually look at a screenshot to confirm it
rendered — a clean `tsc`/bundle is not proof of a working UI (see
CLAUDE.md "Verifying UI changes").

## 0. Check for an already-running Metro server first

A stale server from an earlier session holds port 8081 and a fresh
`npx expo start` will fail outright instead of prompting for another
port.

```bash
ps aux | grep "expo start" | grep -v grep
```

If one is already running, don't start a second — just get the
right platform's device booted (below) and either let Expo's existing
process pick it up, or reload into it directly (see step 3).

**Don't pass `CI=1` or `--non-interactive`** if you intend to make
further edits and re-verify — that flag disables Metro's file
watcher, so code changes silently won't be picked up on reload even
though the JS on disk is correct. Only use it for a single one-shot
launch you don't intend to iterate on.

## 1. Boot the device

**Android:**

```bash
emulator -list-avds                      # find the AVD name, e.g. commit72_pixel
adb devices                               # see what's already attached
nohup emulator -avd <avd-name> > /tmp/emulator.log 2>&1 &
disown
```

Then wait for a full boot (not just device attach — `adb devices`
lists it as `device` well before the OS is actually usable):

```bash
until adb devices | grep -q "device$"; do sleep 2; done
until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 2; done
```

Wrap that in the Monitor tool (or `run_in_background` + a completion
check) rather than a foreground sleep loop — first boot of a cold AVD
can take a couple of minutes.

**iOS:**

```bash
xcrun simctl list devices booted          # anything already booted?
xcrun simctl list devicetypes             # if you need to pick a device
open -a Simulator                         # launches the Simulator app UI
xcrun simctl boot "<device name or udid>" # if nothing is booted yet
```

`open -a Simulator` alone is usually enough if a device was booted
before and just needs its window reopened.

## 2. Start Metro / launch the app

If no server is running yet (step 0):

```bash
nohup npx expo start --android > /tmp/expo-android.log 2>&1 &   # Android
nohup npx expo start --ios     > /tmp/expo-ios.log     2>&1 &   # iOS
disown
```

`.env` changes require a full Metro restart, not just a reload —
`EXPO_PUBLIC_*` vars are inlined at dev-server start, not per-bundle.

Watch the log for the bundle result rather than guessing timing:

```bash
tail -f /tmp/expo-android.log | grep -E "Bundled|error|Error|Failed|Opening exp"
```

Look for a line like `Android Bundled Nms node_modules/expo-router/entry.js (N modules)`
with no accompanying `error`/`Error`/`Failed` — that's your signal
the JS actually loaded, not just that the CLI command exited 0.

### Reloading into an already-running server instead

If Metro is already up and you just need the app open/refreshed on a
device:

```bash
# Android — reload the existing app
adb shell am start -a android.intent.action.VIEW -d "exp://<lan-ip>:8081"

# iOS — same idea
xcrun simctl openurl booted "exp://<lan-ip>:8081"
```

Get `<lan-ip>` from the "Opening exp://..." line already printed in
the Metro log, or `ipconfig getifaddr en0`.

### Jumping straight to a specific screen

Deep links beat tap-simulation for reaching a screen that isn't the
default landing tab — especially useful since iOS has no reliable way
to simulate taps into small targets (see step 4).

```bash
xcrun simctl openurl booted "exp://<lan-ip>:8081/--/<route-path>"
adb shell am start -a android.intent.action.VIEW -d "exp://<lan-ip>:8081/--/<route-path>"
```

`<route-path>` is the expo-router path, e.g. `compare` or `add-ticker`.

## 3. Verify with a screenshot — don't just claim it worked

```bash
# Android
adb shell screencap -p /sdcard/screen.png && adb pull /sdcard/screen.png /tmp/android-screen.png

# iOS
xcrun simctl io booted screenshot /tmp/ios-screen.png
```

Then actually `Read` the resulting image file and look at it. Check
*every* screen/state the change touches, not just the first one — see
CLAUDE.md's `TabTrigger`/`ScrollView`/safe-area gotchas, all three of
which type-check and bundle cleanly while rendering visibly wrong.

## 4. If you need to interact (tap/type), know the limits

`xcrun simctl` has no tap/text-input primitive. The fallback is
AppleScript driving the Simulator window via System Events, mapping
device screenshot pixel coordinates into the Simulator window's
point-space frame:

```bash
osascript -e 'tell application "System Events" to tell process "Simulator" to get {position, size} of window 1'
osascript -e 'tell application "System Events" to tell process "Simulator" to click at {x, y}'
```

This works for large targets (tab bar icons) but is unreliable for
small ones (~32pt buttons), and **could not reliably focus a
`TextInput` at all** — clicks land on the right accessibility element
but never bring up a keyboard, and `keystroke` types nothing. Don't
burn a long tool-call chain coordinate-hunting for a text field; flag
it for a human smoke-test instead. Prefer a deep link (step 2) over
tap-simulation wherever the target screen supports one.

Android has the same "no built-in tap primitive" limitation via `adb`
alone — `adb shell input tap <x> <y>` exists and is more reliable than
the iOS AppleScript route for large targets, but the same "don't
fight small targets or text fields" guidance applies.

## Known environment gotchas (Simulator/emulator chrome, not app bugs)

- A persistent, draggable blue gear-icon overlay sits in the iOS
  Simulator window's top-right area and can cover small custom header
  buttons in that region, making them look "missing" in a screenshot.
  It's draggable — a stray click can move it and reveal what's
  underneath before you conclude something actually broke.
