let runtimePromise = null;

function loadRuntime() {
  if (!runtimePromise) {
    runtimePromise = import("/assets/vendor/espeak-ng/espeak-ng.js").then(
      async ({ default: initialise }) => {
        const module = await initialise();
        return new module.eSpeakNGWorker();
      }
    );
  }
  return runtimePromise;
}

function combineChunks(chunks) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const samples = new Int16Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }
  return samples;
}

self.addEventListener("message", async ({ data }) => {
  const { id, type } = data ?? {};
  if (!Number.isInteger(id)) return;

  try {
    const instance = await loadRuntime();
    if (type === "preload") {
      self.postMessage({ id, type: "ready" });
      return;
    }
    if (type !== "synthesize") return;

    instance.set_voice(data.voice);
    instance.set_rate(data.rate);
    instance.set_pitch(data.pitch);
    const chunks = [];
    instance.synthesize(String(data.text), (samples) => {
      if (samples?.length) chunks.push(samples);
    });
    const samples = combineChunks(chunks);
    self.postMessage(
      { id, type: "audio", samples: samples.buffer, sampleRate: instance.samplerate || 22050 },
      [samples.buffer]
    );
  } catch (error) {
    self.postMessage({
      id,
      type: "error",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});
