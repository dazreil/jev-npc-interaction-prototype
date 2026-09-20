const PIPER_MODULE_URL = "/assets/vendor/piper/piper-tts-web.js";
const WASM_PATHS = Object.freeze({
  onnxWasm: "/assets/vendor/piper/ort/",
  piperData: "/assets/vendor/piper/piper_phonemize.data",
  piperWasm: "/assets/vendor/piper/piper_phonemize.wasm"
});

let piperModulePromise = null;
let session = null;
let loadedVoiceId = null;
let workQueue = Promise.resolve();

function readAscii(view, offset, length) {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(view.getUint8(offset + index));
  }
  return value;
}

export function decodePiperWav(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  if (view.byteLength < 44 || readAscii(view, 0, 4) !== "RIFF" || readAscii(view, 8, 4) !== "WAVE") {
    throw new Error("Piper returned an invalid WAV file.");
  }

  let offset = 12;
  let format = null;
  let dataOffset = -1;
  let dataLength = 0;

  while (offset + 8 <= view.byteLength) {
    const tag = readAscii(view, offset, 4);
    const length = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    if (chunkStart + length > view.byteLength) break;

    if (tag === "fmt " && length >= 16) {
      format = {
        encoding: view.getUint16(chunkStart, true),
        channels: view.getUint16(chunkStart + 2, true),
        sampleRate: view.getUint32(chunkStart + 4, true),
        bitsPerSample: view.getUint16(chunkStart + 14, true)
      };
    } else if (tag === "data") {
      dataOffset = chunkStart;
      dataLength = length;
      break;
    }
    offset = chunkStart + length + (length % 2);
  }

  if (!format || dataOffset < 0) throw new Error("Piper WAV is missing audio data.");
  if (format.encoding !== 1 || format.channels !== 1 || format.bitsPerSample !== 16) {
    throw new Error("Piper WAV must contain mono 16-bit PCM.");
  }

  const sampleCount = Math.floor(dataLength / 2);
  const samples = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = view.getInt16(dataOffset + index * 2, true) / 32768;
  }
  return { samples, sampleRate: format.sampleRate };
}

async function loadPiperModule() {
  if (!piperModulePromise) piperModulePromise = import(PIPER_MODULE_URL);
  return piperModulePromise;
}

async function ensureSession(voiceId) {
  const piper = await loadPiperModule();
  if (session && loadedVoiceId === voiceId) return session;

  if (loadedVoiceId && loadedVoiceId !== voiceId) {
    piper.TtsSession._instance = null;
    session = null;
  }

  const progress = ({ loaded = 0, total = 0 } = {}) => {
    self.postMessage({ type: "progress", loaded, total });
  };
  session = await piper.TtsSession.create({ voiceId, progress, wasmPaths: WASM_PATHS });
  loadedVoiceId = voiceId;
  return session;
}

async function handleRequest(data) {
  const { id, type, voiceId } = data ?? {};
  if (!Number.isInteger(id)) return;

  try {
    const activeSession = await ensureSession(voiceId);
    if (type === "preload") {
      self.postMessage({ id, type: "ready" });
      return;
    }
    if (type !== "synthesize") return;

    const wav = await activeSession.predict(String(data.text));
    const { samples, sampleRate } = decodePiperWav(await wav.arrayBuffer());
    self.postMessage(
      { id, type: "audio", samples: samples.buffer, sampleRate },
      [samples.buffer]
    );
  } catch (error) {
    self.postMessage({
      id,
      type: "error",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

if (typeof self !== "undefined") {
  self.addEventListener("message", ({ data }) => {
    workQueue = workQueue.then(() => handleRequest(data), () => handleRequest(data));
  });
}
