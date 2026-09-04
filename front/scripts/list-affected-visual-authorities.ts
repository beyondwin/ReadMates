import { resolve } from "node:path";

import { runListAffectedVisualAuthorities } from "../tests/performance/visual-authority-docker";

const exitCode = runListAffectedVisualAuthorities(process.argv.slice(2), {
  writeStdout: (text) => {
    process.stdout.write(text);
  },
  writeStderr: (text) => {
    process.stderr.write(text);
  },
  cwd: process.cwd(),
  frontRoot: resolve(import.meta.dirname, ".."),
});

process.exitCode = exitCode;
