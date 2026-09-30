// Free demo of lib/composite.mjs on pictures the pilots already made.
//
//   node fmv-lora/composite.mjs --demo
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chooseParameters, composite, key, seeded } from "../lib/composite.mjs";

export * from "../lib/composite.mjs";

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes("--demo")) {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const out = join(HERE, "composites", "demo");
  await mkdir(out, { recursive: true });
  const background = join(HERE, "pilot", "raw", "001-styled.png");
  const actors = [
    { id: "006-green", file: join(HERE, "pilot-krea", "raw", "006-plain.png"), shot: "medium" },
    { id: "005-blue", file: join(HERE, "pilot-krea", "raw", "005-plain.png"), shot: "full" }
  ];
  const log = [];
  for (const actor of actors) {
    const keyed = join(out, `${actor.id}-keyed.png`);
    const { screen, box } = await key(actor.file, keyed);
    console.log(`${actor.id}: screen ${screen.hex} (${screen.screen}), actor ${box.width}x${box.height}`);
    for (const seed of [1, 2]) {
      const parameters = chooseParameters(seeded(seed * 100 + actors.indexOf(actor)), { shot: actor.shot });
      const file = join(out, `${actor.id}-on-001-seed${seed}.png`);
      const used = await composite(background, keyed, file, parameters);
      log.push({ actor: actor.id, background: "001-styled", seed, file, parameters: used });
      console.log(`  seed ${seed}: ${JSON.stringify(used)}`);
    }
  }
  await writeFile(join(out, "demo.json"), JSON.stringify(log, null, 2));
}
