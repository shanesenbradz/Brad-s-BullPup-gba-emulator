# Google Play release kit

Everything needed to put Brad's Bullpup on the Play Store. The Play build is the same app as the sideload APK, published as `com.bradz.bullpup` so it can live on a phone next to the sideloaded `com.bradz.calzone`. Package names can never change once an app is on Play, which is why the old Calzone name isn't carried over.

## Build it

```
./tools/build_apk.sh             # once, to fetch the toolchain
UPLOAD_KEYSTORE=keys/bullpup-upload.jks UPLOAD_ALIAS=upload UPLOAD_PASS=... ./tools/build_aab.sh
```

That writes `dist/Brads_Bullpup_play.aab`, signed with the upload key, targeting API 36 (what Play requires for new apps since 31 August 2026), min API 24. Bump `VC` (version code) for every upload: `VC=7 VN=1.6 ./tools/build_aab.sh`.

## Play Console checklist

1. Create a developer account at play.google.com/console (one-time US$25). New personal accounts have to run a closed test with at least 12 testers for 14 days before they can publish to production, so line up testers early.
2. Create app: name "Brad's Bullpup", default language English, App, Free.
3. App signing: leave Play App Signing on and upload the AAB. Google makes the app signing key, `bullpup-upload.jks` stays your upload key. If the upload key is ever lost, Google can reset it, which is not possible with a sideload key.
4. Store listing: use the text below, `icon-512.png`, `feature-graphic-1024x500.png`, and 2 to 8 phone screenshots (portrait and landscape with a homebrew or public domain game on screen, never a commercial ROM).
5. App content:
   - Privacy policy URL: https://shanesenbradz.github.io/Brad-s-BullPup-gba-emulator/privacy.html
   - Ads: No
   - Data safety: no data collected, no data shared. Data is not encrypted in transit because none is sent. Users can delete data by uninstalling.
   - Content rating (IARC questionnaire): category "Game" or "Utility". Answer no to violence, user interaction, sharing location and purchases. The pixel gun in the icon is a logo, not gameplay, so expect an Everyone / PEGI 3 rating.
   - Target audience: 13 and over (keeps it out of the Families policy).
   - Government app / news / health: No.
6. Release: Testing > Closed testing first, then Production.

## Things that get emulators rejected

- Bundling or linking to commercial ROMs, BIOS files or download sites. The app ships none and the listing must not suggest where to get them.
- Nintendo trademarks in the title, icon or screenshots. Keep "Game Boy" to the description, where it's used only to say what the app is compatible with, and never show Nintendo logos or box art.
- Screenshots of copyrighted games. Use the test ROM or homebrew.

## Store listing text

**Short description (80 characters max)**

Fast, accurate handheld emulator built on mGBA. Offline, no ads, no tracking.

**Full description**

Brad's Bullpup plays Game Boy Advance, Game Boy and Game Boy Color games you've dumped from cartridges you own. Emulation comes from mGBA, one of the most accurate cores around, and the whole app is about 450 KB.

What you get:
• Save states in 9 slots with screenshots, plus an automatic snapshot when you leave a game
• Auto save lights on the controller that count down to the next snapshot
• Rewind, fast forward up to 12x and slow motion
• In-game saves kept automatically, with .sav import and export so you can bring saves over from other emulators
• Cheats in Raw, CodeBreaker, GameShark and Action Replay formats, plus a RAM search to find your own
• IPS, UPS and BPS patches for ROM hacks and translations
• Screen shaders (LCD grid, scanlines, CRT and more), colour correction and frame blending
• Audio reverb, EQ and a handheld speaker mode
• 11 controller skins, button styles, vibration levels, click sounds and your own photo as a vinyl wrap
• Gamepad and keyboard support with full remapping, plus a touch layout editor
• Screenshots and MP4 clips saved to Downloads
• One-file backup of every save, state, cheat and setting

No games are included. Brad's Bullpup has no ads, no accounts and no internet access. Everything stays on your phone.

Brad's Bullpup is not affiliated with or endorsed by Nintendo. Game Boy is a trademark of Nintendo.
