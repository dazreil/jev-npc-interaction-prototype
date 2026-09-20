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
const source = await readFile(browserBundle, "utf8");
const bareImport = 'import("onnxruntime-web/wasm")';
if (!source.includes(bareImport)) {
  throw new Error("Piper bundle no longer contains the expected ONNX bare import.");
}
await writeFile(
  browserBundle,
  source.replaceAll(bareImport, 'import("./ort/ort.wasm.min.js")'),
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
    resolve(licenseRoot, "en_GB-northern_english_male-medium-MODEL_CARD"),
    resolve(destination, "en_GB-northern_english_male-medium-MODEL_CARD")
  )
]);

console.log(
  `Installed browser Piper assets in assets/vendor/piper (${piperFiles.length} modules, ${ortFiles.length} ONNX runtimes).`
);
