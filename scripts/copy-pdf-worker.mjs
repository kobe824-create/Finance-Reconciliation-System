import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptDir);
const worker = require.resolve("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
const target = join(projectRoot, "public", "pdf.worker.min.mjs");
await mkdir(dirname(target), { recursive: true });
await copyFile(worker, target);
console.log("PDF text extraction worker copied to public/pdf.worker.min.mjs.");
