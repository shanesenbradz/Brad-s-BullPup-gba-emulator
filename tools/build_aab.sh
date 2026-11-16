#!/bin/bash
# Builds the Google Play version: dist/Brads_Bullpup_play.aab (an Android App Bundle, which Play requires).
# It is the same app as the sideload APK, published under its own package name (com.bradz.bullpup) so both
# can sit on one phone. Run tools/build_apk.sh once first so the toolchain is downloaded.
#
# Signing: set UPLOAD_KEYSTORE, UPLOAD_PASS and UPLOAD_ALIAS to your Play upload key. Google re-signs the
# app with its own app signing key when it's delivered from Play (Play App Signing).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
TC=.toolchain; B=build-aab
PKG=${PKG:-com.bradz.bullpup}; VC=${VC:-8}; VN=${VN:-1.7}; TARGET=${TARGET:-36}
T=$TC/minapk/package/tools; AJ=$T/android.jar
[ -d $TC/minapk ] || { echo "Run tools/build_apk.sh first to fetch the toolchain"; exit 1; }
case "$(uname -s)" in Darwin) AAPT2=$TC/aapt/package/bin/x64/darwin/aapt2;; *) AAPT2=$TC/aapt/package/bin/x64/linux/aapt2;; esac
BT=$TC/bundletool.jar
[ -f $BT ] || curl -sSL -o $BT https://github.com/google/bundletool/releases/download/1.18.1/bundletool-all-1.18.1.jar
VN=$VN python3 tools/bundle.py >/dev/null

rm -rf $B; mkdir -p $B/assets $B/classes $B/dex $B/base
cp dist/Brads_Bullpup.html $B/assets/index.html
"$AAPT2" compile --dir android/res -o $B/res.zip
# --proto-format is what bundletool expects; the Java package stays com.bradz.calzone, only the app id changes
"$AAPT2" link --proto-format -I $AJ --manifest android/AndroidManifest.xml -o $B/linked.zip -A $B/assets \
  --min-sdk-version 24 --target-sdk-version $TARGET --version-code $VC --version-name $VN \
  --rename-manifest-package $PKG --java $B/gen $B/res.zip
java -jar $T/ecj-3.45.0.jar -8 -nowarn -cp $AJ -d $B/classes $(find android/src $B/gen -name '*.java')
java -cp $T/d8.jar com.android.tools.r8.D8 --release --min-api 24 --lib $AJ --output $B/dex $(find $B/classes -name '*.class')

# Lay the module out the way bundletool wants: manifest/, dex/, res/, assets/, resources.pb
(cd $B/base && unzip -q ../linked.zip && mkdir -p manifest dex && mv AndroidManifest.xml manifest/ && cp ../dex/classes.dex dex/)
(cd $B/base && zip -q -r -X ../base.zip .)
rm -f dist/Brads_Bullpup_play.aab
java -jar $BT build-bundle --modules=$B/base.zip --output=dist/Brads_Bullpup_play.aab

if [ -n "${UPLOAD_KEYSTORE:-}" ]; then
  jarsigner -sigalg SHA256withRSA -digestalg SHA-256 -keystore "$UPLOAD_KEYSTORE" -storepass "$UPLOAD_PASS" \
    dist/Brads_Bullpup_play.aab "$UPLOAD_ALIAS" >/dev/null
  jarsigner -verify dist/Brads_Bullpup_play.aab | tail -1
else
  echo "Not signed: set UPLOAD_KEYSTORE, UPLOAD_PASS and UPLOAD_ALIAS to sign with your upload key"
fi
java -jar $BT validate --bundle=dist/Brads_Bullpup_play.aab >/dev/null && echo "dist/Brads_Bullpup_play.aab ($PKG $VN, target API $TARGET) is ready for Play Console"
