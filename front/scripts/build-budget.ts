import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import {
  analyzeBuildAssets,
  renderBuildBudgetMarkdown,
  type BuildAssetInput,
} from "../tests/performance/build-budget";

const frontRoot = resolve(import.meta.dirname, "..");
const distAssetsDir = resolve(frontRoot, "dist", "assets");
const outputDir = resolve(frontRoot, "..", ".tmp", "performance");

async function readAssets(): Promise<BuildAssetInput[]> {
  const entries = await readdir(distAssetsDir);
  const assets: BuildAssetInput[] = [];

  for (const fileName of entries) {
    if (!fileName.endsWith(".js") && !fileName.endsWith(".css")) continue;
    const path = resolve(distAssetsDir, fileName);
    const [metadata, contents] = await Promise.all([stat(path), readFile(path)]);
    assets.push({
      fileName,
      bytes: metadata.size,
      gzipBytes: gzipSync(contents).byteLength,
    });
  }

  return assets;
}

async function run() {
  const assets = await readAssets();
  if (assets.length === 0) {
    throw new Error(`No JS/CSS assets found in ${distAssetsDir}. Run the frontend build first.`);
  }

  const report = analyzeBuildAssets(assets);
  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, "build-budget.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(resolve(outputDir, "build-budget.md"), renderBuildBudgetMarkdown(report), "utf8");
  console.log(`Build budget report written to ${resolve(outputDir, "build-budget.md")}`);

  if (report.status === "failed") {
    for (const violation of report.violations) {
      console.error(
        `Budget error: ${violation.fileName} in ${violation.bucket} is ${violation.bytes} bytes, limit ${violation.limitBytes}`,
      );
    }
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
