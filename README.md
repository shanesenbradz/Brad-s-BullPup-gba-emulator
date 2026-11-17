# Brad's Bullpup

A Game Boy Advance, Game Boy and Game Boy Color emulator for Android that I built to replace Pizza Boy A Pro on my phone. The whole app is one offline HTML file running the mGBA core in WebAssembly, wrapped in a tiny native WebView shell. The APK is about 440 KB.

**Play it in your browser:** https://shanesenbradz.github.io/Brad-s-BullPup-gba-emulator/

<p>
<img src="docs/screenshot.png" width="520" alt="Classic blue skin next to a custom wallpaper">
<img src="docs/raygun.png" width="200" alt="Ray gun skin with a sticker">
</p>

No games are included. Load ROMs you dumped from cartridges you own.

## Install

Download [Brads_Bullpup_1.8.apk](release/Brads_Bullpup_1.8.apk?raw=1) on your phone, open it and allow installs from your browser or file manager if Android asks. Play Protect may warn about an unknown developer, since it isn't from the Play Store. Tap "Install anyway".

You can also skip the install and [run it in the browser](https://shanesenbradz.github.io/Brad-s-BullPup-gba-emulator/). It works offline after the first visit, and Chrome's "Add to Home screen" or "Install app" turns it into a full-screen app. [Brads_Bullpup_1.8.html](release/Brads_Bullpup_1.8.html?raw=1) is the same thing as one file you can keep on a phone or PC.

It runs on Android 7 and up.

### Brad's Bullpup Lite, for older phones

If games stutter or the sound crackles on an older or cheaper phone, try [Brads_Bullpup_Lite_1.0.apk](release/Brads_Bullpup_Lite_1.0.apk?raw=1), or [the Lite web version](https://shanesenbradz.github.io/Brad-s-BullPup-gba-emulator/lite/). It's a separate app (Bullpup Lite, with a green LITE tag on the icon), so it installs next to the full one. Moving your games over takes one backup: export it in the full app under System, import it in Lite.

Lite runs the same mGBA core and keeps cheats, save states, controllers, the touch layout editor, fast forward and .sav import and export. What changes:

- Auto frame skip is on. When the phone can't draw every frame in time, it leaves out one picture in two, three or four, and the game and sound keep full speed. The menu shows how long a frame takes on your phone.
- Skipped frames really are skipped inside the core: the scanline renderer is switched off for that frame while the game logic, timers and sound run as normal. That's about a third of the work of a GBA frame.
- Sound goes straight to the speaker with a slightly bigger buffer. No EQ, reverb, widener or limiter running on the audio thread.
- The screen is drawn at the game's own 240x160 and the phone's graphics chip scales it up (the full app does this now too, see below). Shaders are limited to the cheap ones: Sharp, Smooth, LCD grid, Scanlines and Pea soup.
- No wallpaper, vinyl wrap, ambient glow, glass, grille, stickers, drop shadows or blur. Buttons are flat and don't animate, so a press doesn't repaint the screen.
- Rewind is off by default and uses less memory when you turn it on. Clip recording and the link cable are left out.
- On 90 and 120 Hz screens it asks Android for 60 Hz, since GBA games run at 60 fps anyway.

**Coming from 1.7 or older:** 1.8 is signed with a new long-term release key (the old one was lost), so Android won't install it over an earlier version. In your current version go to System and export a backup, uninstall it, install 1.8 and import the backup. Lite 1.0 uses the same key. Every version from 1.8 on updates in place, keeping your games, saves and states.

## What's new in 1.8

- Every settings section folds shut, so the menus are easy to scan. Tap a section's title to open it, and the app remembers which ones you keep open. Open all and Close all sit at the top of each tab.
- The link cable section moved to the bottom of the game menu and starts closed, since most games never use it. It opens by itself while you're hosting, joining or linked.
- Faster on every phone: when the app has to run a few frames at once to catch up, only the last one is drawn. Before, slow phones drew pictures nobody saw, fell further behind and the sound crackled.
- Sharp and Smooth screens are drawn at 240x160 and scaled up by the graphics chip, instead of running the colour shader on every screen pixel. Clips still record at full size.
- New Performance section in System with frame skip (Off, Auto, or a fixed 1 to 3), and the time a frame takes on your phone.
- The Android app keeps the game's renderer at foreground priority, so Android doesn't slow it down mid-game.

## What's new in 1.7

- Link cable over Wi-Fi or Bluetooth, so two people can trade and battle. It works for GBA games that use the multiplayer or normal link modes (the Pokémon Ruby, Sapphire, Emerald, FireRed and LeafGreen Cable Club, for example) and for the Game Boy and Game Boy Color serial port (Pokémon Red to Crystal trades and battles). Open the menu in a game, tap Host on one phone and Join on the other. Wi-Fi finds the other phone by itself, or you can type its IP. Bluetooth works between phones paired in Android settings.
- While linked, fast forward, rewind and loading states are off so both games stay in step, and the HUD shows LINK.

## What's new in 1.6

- Bluetooth and USB controllers are read by the Android app itself, so Xbox, PlayStation, 8BitDo, Switch Pro and generic pads all work, including D-pads and triggers that report as axes. A controller's B button no longer doubles as the back key.
- Input has a Controllers section that shows what's connected and a "Pair a Bluetooth controller" button that opens Android's Bluetooth screen. Gamepad bindings show real button names (A, L1, Start) instead of numbers.
- You get a message when a controller connects or disconnects, and the touch buttons hide while you play on a controller and come back as soon as you tap the screen.

## What's new in 1.5

- Vibration works on phones where buttons used to feel dead. The page now goes through the Android app's own haptics (a tuned click on phones that have one, a properly sized pulse on the rest) instead of the browser vibration call, which the Android WebView ignores. In the browser the pulses are longer so cheap motors actually spin up, and iOS 18 Safari gets the system tick.
- Auto save lights are on by default, including for existing installs, and now show in landscape too as a small strip in the top left corner.
- The back gesture closes menus, then leaves the game, using Android's predictive back.
- Runs as an installable web app from GitHub Pages with offline support.
- Targets Android 16 (API 36), with a Google Play build (see play/README.md).

## What it does

Emulation is mGBA, one of the most accurate GBA emulators around. On top of that:

- Save states in 9 slots with screenshots, an auto snapshot when you leave a game, and undo for the last save or load
- Rewind (hold the << button), fast forward up to 12x, and slow motion where the audio slows down with it
- In-game saves stored on the phone automatically, plus .sav import and export so you can move saves from Pizza Boy, My Boy or mGBA
- Cheats in Raw, CodeBreaker, GameShark v1/v2 and Action Replay v3 formats
- A RAM search for finding your own cheats: note your health, take a hit, filter by the new value, lock it
- IPS, UPS and BPS patches for ROM hacks and translations
- Screen shaders (LCD grid, subpixels, scanlines, CRT, DMG green), GBA colour correction and frame blending
- Audio effects: reverb with 6 rooms, a 3-band EQ, stereo width and a handheld speaker mode
- Bluetooth and USB controller support with remapping, keyboard remapping, turbo buttons, and a touch layout editor with separate portrait and landscape layouts
- Screenshots and video clip recording, saved to Downloads/Bullpup. Clips are MP4 (H.264 and AAC) on phones that can encode it, so they send straight to WhatsApp, and WebM otherwise
- A backup file with all saves, states, cheats and settings

The Look tab is where I spent the most time. There are 11 controller skins, 5 button styles, an iOS-style light theme, click sounds and vibration levels, and a power LED that changes colour for fast forward, rewind and recording. You can also use a photo as the body of the controller. With Vinyl wrap on, it's printed on like a skin: the picture rolls over the sides and bottom of the body and stretches down into each button well, lit to match the Finish setting. That's baked into a canvas once per layout, so it costs nothing while you play. Six optional green lights next to the power LED fill up as the next auto snapshot gets closer, and the button opacity slider goes down to 5%. The pixel weapons (bullpup, pistol, revolver, ray gun, water blaster, sniper and a bubble blaster) show up as stickers, a body pattern and placeholder covers.

## How it's put together

```
web/          the app: shell.html, app.css, js/ (loaded in filename order)
web/brand/    the pixel bullpup and sprite sheet, plus the Python that draws them
vendor/mgba/  mgba.js and mgba.wasm, plus src/ with the wrapper and link driver they're built from (see SOURCE.md)
android/      manifest, icons and MainActivity.java for the WebView shell (res-lite/ and AndroidManifest.lite.xml for Lite)
web/lite/     Lite's extra stylesheet and icon
tools/        bundle.py and build_apk.sh
test/         a homebrew test ROM, its C source, and a Playwright end-to-end test
dist/         the bundled single-file app
docs/         the GitHub Pages site: the app, web manifest, service worker and privacy policy
play/         Google Play listing text, icon, feature graphic and release checklist
release/      signed APKs and HTML builds, one per version
```

The core is the single-threaded mGBA build from the wasm-gaming project, so it doesn't need SharedArrayBuffer or special server headers. That is what lets it run from a plain file or inside a WebView.

Three tricks are worth explaining because they're not obvious from the code.

Cheats and RAM search need to read and write emulated memory, and the core doesn't export a pointer to it. So when a GBA game loads, I save a state, plant a random 16-byte marker in the work RAM section of that state, load it back and search the wasm heap for the marker. That gives the heap address of the emulated RAM. The original bytes are put back before a single frame runs.

In-game saves had a nastier problem. mGBA only restores save data once it knows the cartridge's save type, and for games outside its override database it works that out the first time the game touches save memory, which is after the game has already read its save. My fix reads the save type from the size of the stored .sav, writes it into byte 0x2E0 of a save state (the savedata type field) and loads that state before the first frame. I checked the layout against mGBA's serialize.h at the pinned commit, so if the core is ever updated this offset needs checking again.

The link cable was the hardest part. A real cable swaps both consoles' values in the same instant, which two phones over Wi-Fi can't do. So the console that drives a transfer sends its value, keeps running for as long as the real transfer would take, and then pauses its CPU mid-frame until the other phone's value arrives (vendor/mgba/src/bullpup_link.c). The other phone answers as soon as its game has re-armed its link port, running a few hundred cycles first if it has to, because answering any earlier hands back a stale value and corrupts things like Pokémon trade data. A reply resumes the paused game immediately instead of waiting for the next screen refresh, which keeps link-heavy screens moving at full speed on Wi-Fi. This needed a custom build of the core, so tools/build_core.sh now rebuilds mGBA to WebAssembly from source.

The Android side is a single activity, targeting API 36. It serves the page from https://appassets.androidplatform.net/ through shouldInterceptRequest, which gives the page a secure origin so IndexedDB, AudioWorklet and crypto behave the way they do in Chrome. It also handles the file picker, a small JavaScript bridge that writes exports to Downloads/Bullpup and plays button haptics, Bluetooth and USB controllers, and LinkManager.java, which carries the link cable over TCP (with network service discovery to find the other phone) or Bluetooth RFCOMM.

## Building it yourself

```
python3 tools/bundle.py          # web/ + vendor/ -> dist/Brads_Bullpup.html and docs/ (GitHub Pages)
./tools/build_apk.sh             # dist/ -> dist/Brads_Bullpup.apk (sideload, com.bradz.calzone)
LITE=1 python3 tools/bundle.py   # Lite: dist/Brads_Bullpup_Lite.html and docs/lite/
LITE=1 ./tools/build_apk.sh      # dist/Brads_Bullpup_Lite.apk (com.bradz.calzone.lite)
python3 tools/lite_icons.py      # Lite's launcher icons with the LITE tag
./tools/build_aab.sh             # dist/ -> dist/Brads_Bullpup_play.aab (Google Play, com.bradz.bullpup)
python3 tools/store_assets.py    # web app icons and Play listing art
./tools/build_core.sh            # rebuilds vendor/mgba from source (needs Emscripten)
```

The APK build doesn't need Android Studio. It downloads aapt2, android.jar, d8, ecj and apksigner from two npm packages into .toolchain/ and needs Java 17 or newer, Node and Python 3. I compile with ecj instead of javac because d8 8.2 rejects the MethodParameters attribute that newer javac versions write into inner classes.

Without signing settings the script makes a new key in keys/, which is git-ignored. To sign with your own key, set KEYSTORE, KS_PASS and KS_ALIAS. My release key isn't in this repo, and neither is the Play upload key (UPLOAD_KEYSTORE, UPLOAD_PASS, UPLOAD_ALIAS for build_aab.sh).

To run the tests (Playwright with Chromium):

```
python3 test/e2e.py
./test/link/build.sh                                  # link test ROMs, built with clang and lld
python3 test/link/e2e_link.py test/link/gba_link.gba 4 10   # two copies of the app, 10 ms lag each way
python3 test/link/e2e_link.py test/link/gb_link.gb 4 10
```

They boot the test ROM, check touch input, RAM search, all three cheat formats, save states, rewind, fast forward and that in-game saves survive a reload.

## What's missing

Tilt and solar sensors, cartridge rumble, the GBA Wireless Adapter (FireRed and LeafGreen's Union Room) and RetroAchievements aren't supported. Link cable play is two players only, needs the Android app on both phones, and doesn't work in the browser version. Cheats only reach work RAM, so codes that patch the ROM are skipped. Cheats and RAM search are GBA only.

The automated tests run a homebrew ROM in headless Chrome. It hasn't been tried across a wide range of phones and games, so expect some where something is off. Open an issue with the game, the phone model and what you see.

## Credits and licence

Emulation is [mGBA](https://github.com/mgba-emu/mgba) by Jeffrey Pfau and contributors, built for the web by [wasm-gaming/mGBA-wasm](https://github.com/wasm-gaming/mGBA-wasm). Cheat code formats follow VBA-M's gbaCheats.cpp. The test ROM is built with libtonc.

Released under the Mozilla Public License 2.0, the same licence as mGBA.
