// ComfyUI workflows as models (Comfy Cloud, cloud.comfy.org). A workflow
// exported in API format is kept in the game folder (library/workflows/), and
// a Library model points at it, with where its prompt, input picture, seed and
// size go ("node id.input name"). A card that picks the model fills those in,
// and the result comes back like any other model's.
//
// Needs a Comfy API key (platform.comfy.org) and a paid Comfy Cloud plan.

const BASE = "https://cloud.comfy.org";

/** Every node's id, class and inputs, from an API-format workflow. */
function nodes(graph) {
  if (!graph || typeof graph !== "object" || Array.isArray(graph)) throw new Error("Not an API-format workflow: in ComfyUI, use Export (API)");
  const list = Object.entries(graph).filter(([, node]) => node && typeof node === "object" && node.class_type && node.inputs);
  if (!list.length) throw new Error("Not an API-format workflow: in ComfyUI, use Export (API)");
  return list;
}

/**
 * Guesses where a card's values go, by how the nodes connect: the prompt is
 * the text node wired to the sampler's positive input; the picture is the
 * first LoadImage; the seed is the sampler's; the size is the empty latent's.
 */
export function guessInputs(graph) {
  const list = nodes(graph);
  const find = (test) => list.find(([, node]) => test(node));
  const linkedTo = (value) => (Array.isArray(value) ? String(value[0]) : null);
  const sampler = find((node) => /Sampler|Guider/i.test(node.class_type) && (node.inputs.positive || node.inputs.conditioning || node.inputs.seed != null || node.inputs.noise_seed != null));
  const textField = (node) => ["text", "prompt", "text_g", "string"].find((key) => typeof node.inputs[key] === "string");
  let prompt = null;
  const positive = sampler && linkedTo(sampler[1].inputs.positive ?? sampler[1].inputs.conditioning);
  if (positive && graph[positive] && textField(graph[positive])) prompt = `${positive}.${textField(graph[positive])}`;
  if (!prompt) {
    const text = find((node) => /TextEncode|Prompt|String/i.test(node.class_type) && textField(node));
    if (text) prompt = `${text[0]}.${textField(text[1])}`;
  }
  const image = find((node) => /^LoadImage/.test(node.class_type) && node.inputs.image != null);
  const seedNode = find((node) => node.inputs.seed != null && !Array.isArray(node.inputs.seed)) ?? find((node) => node.inputs.noise_seed != null && !Array.isArray(node.inputs.noise_seed));
  const latent = find((node) => /EmptyLatent|EmptySD3Latent|EmptyHunyuan/i.test(node.class_type) && node.inputs.width != null);
  const output = find((node) => /Save(Image|Video|Animated|WEBM)|VHS_VideoCombine/i.test(node.class_type));
  return {
    prompt,
    image: image ? `${image[0]}.image` : null,
    seed: seedNode ? `${seedNode[0]}.${seedNode[1].inputs.seed != null ? "seed" : "noise_seed"}` : null,
    width: latent ? `${latent[0]}.width` : null,
    height: latent ? `${latent[0]}.height` : null,
    output: output ? output[0] : null
  };
}

/** Sets "node.input" in a copy of the workflow. */
function setInput(graph, path, value) {
  if (!path) return;
  const [node, ...rest] = String(path).split(".");
  const input = rest.join(".");
  if (!graph[node]?.inputs || !input) throw new Error(`The workflow has no ${path}`);
  graph[node].inputs[input] = value;
}

async function failText(response) {
  return `${response.status} ${(await response.text()).slice(0, 300)}`;
}

/** Uploads a data: URI picture as a workflow input; returns its name for LoadImage. */
async function upload(key, uri, index) {
  const [, mime, data] = String(uri).match(/^data:([^;]+);base64,(.*)$/) ?? [];
  if (!data) throw new Error("expected a data: URI picture");
  const form = new FormData();
  form.append("image", new Blob([Buffer.from(data, "base64")], { type: mime }), `reference-${Date.now()}-${index}.${mime.split("/")[1] ?? "png"}`);
  form.append("type", "input");
  form.append("overwrite", "true");
  const response = await fetch(`${BASE}/api/upload/image`, { method: "POST", headers: { "X-API-Key": key }, body: form });
  if (!response.ok) throw new Error(`Comfy upload: ${await failText(response)}`);
  const { name, subfolder } = await response.json();
  return subfolder ? `${subfolder}/${name}` : name;
}

/** A finished file, through its signed link (the key never goes to the storage host). */
async function download(key, file) {
  const params = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder ?? "", type: file.type ?? "output" });
  const response = await fetch(`${BASE}/api/view?${params}`, { headers: { "X-API-Key": key }, redirect: "manual" });
  if (response.status === 200) return Buffer.from(await response.arrayBuffer());
  const signed = response.headers.get("location");
  if (!signed) throw new Error(`Comfy download: ${response.status}`);
  const file2 = await fetch(signed);
  if (!file2.ok) throw new Error(`Comfy download: ${file2.status}`);
  return Buffer.from(await file2.arrayBuffer());
}

/** The first picture or video among a job's outputs (from the output node, if named). */
function firstFile(outputs, preferNode) {
  const order = preferNode && outputs[preferNode] ? [outputs[preferNode], ...Object.values(outputs)] : Object.values(outputs);
  for (const output of order) {
    for (const key of ["images", "video", "videos", "gifs"]) {
      const file = [].concat(output?.[key] ?? []).find((item) => item?.filename && (item.type ?? "output") === "output");
      if (file) return file;
    }
  }
  return null;
}

/**
 * Runs a workflow on Comfy Cloud with a card's values.
 * @param model { workflow (the graph), inputs: { prompt, image, seed, width, height, output } }
 * @returns { bytes, ext }
 */
export async function runWorkflow(key, model, { prompt, images = [], seed, size, timeoutMs = 15 * 60 * 1000 }) {
  const graph = structuredClone(model.workflow);
  const inputs = model.inputs ?? guessInputs(graph);
  if (!inputs.prompt) throw new Error("The workflow model needs to know where the prompt goes (inputs.prompt)");
  setInput(graph, inputs.prompt, prompt);
  if (images.length) {
    if (!inputs.image) throw new Error("This workflow takes no picture (no LoadImage node); pick an image model for this card instead");
    setInput(graph, inputs.image, await upload(key, images[0], 0));
  }
  setInput(graph, inputs.seed, seed != null ? Number(seed) : Math.floor(Math.random() * 2 ** 31));
  const [width, height] = String(size ?? "").match(/^(\d+)\s*x\s*(\d+)$/i)?.slice(1).map(Number) ?? [];
  if (width && height) {
    setInput(graph, inputs.width, width);
    setInput(graph, inputs.height, height);
  }

  // Listen before sending, so the "finished" message cannot be missed.
  const outputs = {};
  let done;
  const finished = new Promise((resolve, reject) => (done = { resolve, reject }));
  let promptId = null;
  const early = [];
  const ws = new WebSocket(`wss://cloud.comfy.org/ws?clientId=${crypto.randomUUID()}&token=${encodeURIComponent(key)}`);
  const handle = (data) => {
    if (data.data?.prompt_id !== promptId) return;
    if (data.type === "executed" && data.data.output) outputs[data.data.node] = data.data.output;
    else if (data.type === "execution_success") done.resolve(outputs);
    else if (data.type === "execution_error") done.reject(new Error(`Comfy: ${data.data.exception_message ?? "the workflow failed"}`));
  };
  ws.onmessage = (event) => {
    if (typeof event.data !== "string") return;
    const data = JSON.parse(event.data);
    if (promptId) handle(data);
    else early.push(data);
  };
  await new Promise((resolve) => {
    const give = setTimeout(resolve, 5000);
    ws.onopen = ws.onerror = () => { // on an error, the status check below still finds the result
      clearTimeout(give);
      resolve();
    };
  });
  try {
    const response = await fetch(`${BASE}/api/prompt`, { method: "POST", headers: { "X-API-Key": key, "Content-Type": "application/json" }, body: JSON.stringify({ prompt: graph }) });
    if (!response.ok) throw new Error(`Comfy: ${await failText(response)}`);
    promptId = (await response.json()).prompt_id;
    early.forEach(handle);
    // A status check alongside, in case the live connection drops.
    const started = Date.now();
    let stopped = false;
    let timer;
    const wait = (ms) => new Promise((resolve) => (timer = setTimeout(resolve, ms)));
    const poll = (async () => {
      while (!stopped && Date.now() - started < timeoutMs) {
        await wait(4000);
        if (stopped) return null;
        const status = await fetch(`${BASE}/api/job/${promptId}/status`, { headers: { "X-API-Key": key } }).then((r) => r.json()).catch(() => null);
        const state = status?.status;
        if (["error", "non_retryable_error", "lost", "cancelled"].includes(state)) throw new Error(`Comfy: the job ended with ${state}`);
        if (state === "success") {
          await wait(3000);
          if (Object.keys(outputs).length) return outputs;
          const history = await fetch(`${BASE}/api/history/${promptId}`, { headers: { "X-API-Key": key } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
          const found = history?.[promptId]?.outputs ?? history?.outputs;
          if (found) return found;
          throw new Error("Comfy: the job finished, but its outputs could not be read");
        }
      }
      throw new Error("Comfy: the job did not finish in time");
    })();
    poll.catch(() => {}); // when the live connection wins, a later poll error is not needed
    const result = await Promise.race([finished, poll]).finally(() => {
      stopped = true;
      clearTimeout(timer);
    });
    const file = firstFile(result, inputs.output);
    if (!file) throw new Error("Comfy: the workflow saved no picture or video (add a Save Image node)");
    return { bytes: await download(key, file), ext: (file.filename.match(/\.\w+$/)?.[0] ?? ".png").toLowerCase() };
  } finally {
    ws.close();
  }
}
