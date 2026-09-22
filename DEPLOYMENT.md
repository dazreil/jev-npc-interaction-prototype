# Deployment

The game has two release modes. Both serve the same framework-free HTML, CSS, JavaScript, data, font, portraits, and local eSpeak runtime.

## Mock-only static hosting

Use this mode for a shareable build with the deterministic Mock decision system and no credentials.

1. Install Node.js 20 or newer.
2. Run `npm ci`. The post-install script copies the pinned eSpeak NG runtime into `assets/vendor/espeak-ng/`.
3. Publish the project root as the static site directory. Include `index.html`, `styles.css`, `js/`, `data/`, and `assets/`.
4. Configure the host to serve `.js` as JavaScript, `.json` as JSON, `.webp` as `image/webp`, `.ttf` as `font/ttf`, and `.data` as `application/octet-stream`.

No build command is required after `npm ci`. The Jev option will explain that it requires the Node server; Mock remains fully playable. Do not launch the release from a `file://` address because browsers block its module and JSON requests.

## Server-backed Jev hosting

Use this mode when players should be able to switch between Mock and TypeSafe Jev.

Set these server environment variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `TYPESAFE_API_KEY` | Yes | TypeSafe credential kept on the server only. |
| `HOST` | For containers | Bind address. Use `0.0.0.0` in a container or hosted service. Defaults to `127.0.0.1`. |
| `PORT` | No | HTTP port. Defaults to `5173`. |

Then run:

```bash
npm ci
HOST=0.0.0.0 PORT=5173 npm start
```

Put the service behind HTTPS for a public release. The Node server serves the static game and exposes the same-origin `/api/jev/status` and `/api/jev/decision` routes. It never sends the TypeSafe credential to the browser.

The included `Dockerfile` provides the same setup:

```bash
docker build -t jev-npc .
docker run --rm -p 5173:5173 -e TYPESAFE_API_KEY jev-npc
```

After deployment, open the public HTTP(S) address, confirm the boot sequence completes, send one Mock transmission, switch to Jev, send one live transmission, and verify that mute, replay, skip, reset, credits, and the F2 developer panel work.

## Vercel hosting

Vercel serves the game as static files and runs the two Jev routes as functions. The routes live in `api/jev/status.js` and `api/jev/decision.js`. They share `lib/jev-proxy.mjs` with the local Node server, so both hosts behave the same way.

`vercel.json` tells Vercel to run `npm ci`, then `npm run build`. The build copies only `index.html`, `styles.css`, `assets/`, `data/`, and `js/` into `dist/`. Server code, tests, and notes are never published.

First deploy:

```bash
vercel link --yes
vercel env add TYPESAFE_API_KEY production
vercel deploy --prod
```

The `env add` command asks for the key. Paste it there. Do not put the key in `vercel.json` or in a command line.

The Jev route is public. Anyone with the address can send it requests, and each request uses TypeSafe credit. Share the address only with people you trust, or remove the key to fall back to Mock.

## Release check

Run the offline release gate before publishing:

```bash
npm run evaluate:phase15
```

This runs the unit tests, dialogue linter, portrait manifest and size checks, immediate-preload check, motion/accessibility checks, and deployment-file checks. Live Jev parity remains available separately through `npm run evaluate:phase14` while a Jev-enabled server is running.
