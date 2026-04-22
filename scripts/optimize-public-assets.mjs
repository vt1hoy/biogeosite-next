import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const PROJECT_ROOT = process.cwd();
const INPUT_DIR = path.join(PROJECT_ROOT, "public", "assets");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "public", "assets_optimized");
const MAX_WIDTH = 1600;
const WEBP_QUALITY = 80;

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function isImageFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ext === ".png" || ext === ".jpg" || ext === ".jpeg";
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

async function main() {
  await ensureDir(OUTPUT_DIR);

  /** Manifest maps original public URL -> optimized public URL + optimized dimensions */
  const manifest = {};

  let processed = 0;
  let skipped = 0;

  for await (const absPath of walk(INPUT_DIR)) {
    const relFromInput = path.relative(INPUT_DIR, absPath);
    const relDir = path.dirname(relFromInput);
    const baseName = path.basename(relFromInput, path.extname(relFromInput));

    const originalUrl = `/assets/${toPosix(relFromInput)}`;

    if (!isImageFile(absPath)) {
      skipped++;
      continue;
    }

    const outDir = path.join(OUTPUT_DIR, relDir);
    const outAbs = path.join(outDir, `${baseName}.webp`);
    const optimizedUrl = `/assets_optimized/${toPosix(path.join(relDir, `${baseName}.webp`))}`;

    await ensureDir(outDir);

    const image = sharp(absPath, { failOn: "none" }).rotate();
    const meta = await image.metadata();

    const resized = meta.width && meta.width > MAX_WIDTH ? image.resize({ width: MAX_WIDTH }) : image;

    const outInfo = await resized.webp({ quality: WEBP_QUALITY }).toFile(outAbs);

    manifest[originalUrl] = {
      optimizedUrl,
      width: outInfo.width ?? MAX_WIDTH,
      height: outInfo.height ?? null
    };

    processed++;
  }

  const manifestPath = path.join(OUTPUT_DIR, "manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  console.log(
    [
      `Input: ${INPUT_DIR}`,
      `Output: ${OUTPUT_DIR}`,
      `Processed images: ${processed}`,
      `Skipped non-images: ${skipped}`,
      `Manifest: ${manifestPath}`
    ].join("\n")
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

