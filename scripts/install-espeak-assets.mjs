import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = resolve(
  projectRoot,
  "node_modules/@echogarden/espeak-ng-emscripten"
);
const destination = resolve(projectRoot, "assets/vendor/espeak-ng");

await mkdir(destination, { recursive: true });
await Promise.all([
  copyFile(resolve(packageRoot, "espeak-ng.js"), resolve(destination, "espeak-ng.js")),
  copyFile(resolve(packageRoot, "espeak-ng.data"), resolve(destination, "espeak-ng.data")),
  copyFile(resolve(packageRoot, "COPYING"), resolve(destination, "COPYING"))
]);

console.log("Installed browser eSpeak NG assets in assets/vendor/espeak-ng.");
