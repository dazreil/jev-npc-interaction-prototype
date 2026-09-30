import { readFileSync } from "node:fs";
import { join } from "node:path";

/** A setting from the environment, or else from the project's .env file. */
export function readEnv(root, name) {
  if (process.env[name]) return process.env[name];
  try {
    const match = readFileSync(join(root, ".env"), "utf8").match(new RegExp(`^\\s*${name}\\s*=\\s*(.*?)\\s*$`, "m"));
    return match?.[1].replace(/^(["'])(.*)\1$/, "$2") || undefined;
  } catch {
    return undefined;
  }
}

/** TYPESAFE_API_KEY from the environment or the project's .env file. */
export function readApiKey(root) {
  return readEnv(root, "TYPESAFE_API_KEY");
}
