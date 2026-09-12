// Reuse the bundled Magnific icons; never replace them with generated glyphs.
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const result = spawnSync("python", [path.join(__dirname, "sync-tab-icons.py")], { stdio: "inherit" });
process.exit(result.status ?? 1);
