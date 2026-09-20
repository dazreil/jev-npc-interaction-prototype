import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const piperRoot = resolve(projectRoot, "node_modules/@mintplex-labs/piper-tts-web");
const ortRoot = resolve(projectRoot, "node_modules/onnxruntime-web");
const phonemizerRoot = resolve(projectRoot, "node_modules/@diffusionstudio/piper-wasm");
const licenseRoot = resolve(projectRoot, "scripts/vendor-licenses");
const destination = resolve(projectRoot, "assets/vendor/piper");
const ortDestination = resolve(destination, "ort");

await mkdir(ortDestination, { recursive: true });

const piperFiles = (await readdir(resolve(piperRoot, "dist"))).filter((name) => name.endsWith(".js"));
await Promise.all(
  piperFiles.map((name) =>
    copyFile(resolve(piperRoot, "dist", name), resolve(destination, name))
  )
);

const browserBundle = resolve(destination, "piper-tts-web.js");
let source = await readFile(browserBundle, "utf8");
const bareImport = 'import("onnxruntime-web/wasm")';
if (!source.includes(bareImport)) {
  throw new Error("Piper bundle no longer contains the expected ONNX bare import.");
}
source = source.replaceAll(bareImport, 'import("./ort/ort.wasm.min.js")');

// piper-tts-web forces ONNX Runtime to use every logical CPU. That requires a
// cross-origin-isolated page and is unreliable in Safari even when isolation
// is enabled. Keep Safari and ordinary localhost pages on ONNX's supported
// single-threaded WASM path; isolated non-Safari deployments may use up to four.
const forcedThreadCount = "ort.env.wasm.numThreads = navigator.hardwareConcurrency;";
if (!source.includes(forcedThreadCount)) {
  throw new Error("Piper bundle no longer contains the expected ONNX thread setting.");
}
source = source.replaceAll(
  forcedThreadCount,
  "ort.env.wasm.numThreads = globalThis.crossOriginIsolated && !/^((?!chrome|android).)*safari/i.test(navigator.userAgent) ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;"
);
await writeFile(
  browserBundle,
  source,
  "utf8"
);

const ortFiles = (await readdir(resolve(ortRoot, "dist"))).filter(
  (name) => name.startsWith("ort-wasm") && name.endsWith(".wasm")
);
await Promise.all([
  copyFile(resolve(ortRoot, "dist/esm/ort.wasm.min.js"), resolve(ortDestination, "ort.wasm.min.js")),
  ...ortFiles.map((name) =>
    copyFile(resolve(ortRoot, "dist", name), resolve(ortDestination, name))
  ),
  copyFile(
    resolve(phonemizerRoot, "build/piper_phonemize.data"),
    resolve(destination, "piper_phonemize.data")
  ),
  copyFile(
    resolve(phonemizerRoot, "build/piper_phonemize.wasm"),
    resolve(destination, "piper_phonemize.wasm")
  ),
  copyFile(resolve(licenseRoot, "piper-tts-web-LICENSE"), resolve(destination, "PIPER-TTS-WEB-LICENSE")),
  copyFile(resolve(licenseRoot, "piper-wasm-LICENSE"), resolve(destination, "PIPER-WASM-LICENSE")),
  copyFile(resolve(licenseRoot, "onnxruntime-LICENSE"), resolve(destination, "ONNXRUNTIME-LICENSE")),
  copyFile(
    resolve(licenseRoot, "en_US-danny-low-MODEL_CARD"),
    resolve(destination, "en_US-danny-low-MODEL_CARD")
  )
]);

console.log(
  `Installed browser Piper assets in assets/vendor/piper (${piperFiles.length} modules, ${ortFiles.length} ONNX runtimes).`
);
