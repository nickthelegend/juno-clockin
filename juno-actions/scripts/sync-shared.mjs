// Copy the app's pure transaction builders into this project, byte for byte.
// Vercel deploys this folder alone, so the files are vendored rather than
// imported across the repo; juno-expo/tests/blink-parity.test.ts fails if
// they drift.
import { copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
for (const file of ["solana.ts", "txbuild.ts"]) {
  copyFileSync(join(here, "../../juno-expo/lib", file), join(here, "../shared", file));
  console.log(`synced shared/${file}`);
}
