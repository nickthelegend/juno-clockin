const { withAppBuildGradle } = require("expo/config-plugins");

/**
 * Sign release builds with a real per-app keystore instead of Expo's default
 * debug key — the Solana dApp Store refuses debug-signed APKs, and a judge's
 * install can only upgrade to the store build if both share one key.
 *
 * Nothing secret lives in the repo. Gradle reads a properties file outside it:
 * `$JUNO_SIGNING_PROPERTIES`, else `~/.config/juno-clockin/signing.properties`,
 * with JUNO_STORE_FILE / JUNO_STORE_PASSWORD / JUNO_KEY_ALIAS /
 * JUNO_KEY_PASSWORD. Release packaging refuses missing or incomplete
 * credentials; debug development builds remain available.
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
                println("juno: release credentials unavailable; release packaging will be refused")
            }
        }
    }
}
`;

const PACKAGER_LIMIT = "\n// clockin-release-packager-single-worker\nreact { extraPackagerArgs = [\"--max-workers\", \"1\"] }\n";

const RELEASE_GUARD = "\n// clockin-release-requires-existing-identity\ngradle.taskGraph.whenReady { graph ->\n    if (graph.allTasks.any { it.name in ['assembleRelease', 'bundleRelease', 'packageRelease'] } && !(junoSigningFile.exists() && ['JUNO_STORE_FILE','JUNO_STORE_PASSWORD','JUNO_KEY_ALIAS','JUNO_KEY_PASSWORD'].every { junoSigning.getProperty(it) } && new File(junoSigning.getProperty('JUNO_STORE_FILE')).exists())) {\n        throw new GradleException('Release signing credentials are missing or incomplete; refusing a debug-signed release')\n    }\n}\n";

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes(MARKER)) {
      mod.modResults.contents += BLOCK;
    }
    if (!mod.modResults.contents.includes('clockin-release-requires-existing-identity')) mod.modResults.contents += RELEASE_GUARD;
    if (!mod.modResults.contents.includes('// clockin-release-packager-single-worker')) mod.modResults.contents += PACKAGER_LIMIT;
    return mod;
  });
};
