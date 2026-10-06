const { withAppBuildGradle } = require("expo/config-plugins");

/**
 * Sign release builds with a real per-app keystore instead of Expo's default
 * debug key — the Solana dApp Store refuses debug-signed APKs, and a judge's
 * install can only upgrade to the store build if both share one key.
 *
 * Nothing secret lives in the repo. Gradle reads a properties file outside it:
 * `$JUNO_SIGNING_PROPERTIES`, else `~/.config/juno-clockin/signing.properties`,
 * with JUNO_STORE_FILE / JUNO_STORE_PASSWORD / JUNO_KEY_ALIAS /
 * JUNO_KEY_PASSWORD. Without that file the build falls back to the debug key
 * and says so, so a fresh clone still builds.
 */
const MARKER = "// juno-release-signing";

const BLOCK = `
${MARKER}
def junoSigningFile = new File(System.getenv("JUNO_SIGNING_PROPERTIES") ?: (System.getProperty("user.home") + "/.config/juno-clockin/signing.properties"))
def junoSigning = new Properties()
if (junoSigningFile.exists()) { junoSigningFile.withInputStream { junoSigning.load(it) } }
android {
    signingConfigs {
        junoRelease {
            if (junoSigning.getProperty("JUNO_STORE_FILE")) {
                storeFile file(junoSigning.getProperty("JUNO_STORE_FILE"))
                storePassword junoSigning.getProperty("JUNO_STORE_PASSWORD")
                keyAlias junoSigning.getProperty("JUNO_KEY_ALIAS")
                keyPassword junoSigning.getProperty("JUNO_KEY_PASSWORD")
            }
        }
    }
    buildTypes {
        release {
            if (junoSigning.getProperty("JUNO_STORE_FILE")) {
                signingConfig signingConfigs.junoRelease
            } else {
                println("juno: no release keystore found, signing release with the debug key")
            }
        }
    }
}
`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes(MARKER)) {
      mod.modResults.contents += BLOCK;
    }
    return mod;
  });
};
