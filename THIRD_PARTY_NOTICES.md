# Third-Party Notices

## eSpeak NG Emscripten port

This project uses `@echogarden/espeak-ng-emscripten` version 0.3.5, an Emscripten/WebAssembly build of eSpeak NG maintained by the Echogarden project.

- Source: <https://github.com/echogarden-project/espeak-ng-emscripten>
- Upstream synthesizer: <https://github.com/espeak-ng/espeak-ng>
- License: GNU General Public License version 3. The package's complete `COPYING` file is installed with the browser runtime at `assets/vendor/espeak-ng/COPYING` by `npm install`.

## Piper neural speech (primary voice)

Arthur's voice is synthesised in the browser by Piper, through the
`@mintplex-labs/piper-tts-web` runtime and ONNX Runtime Web. `npm install`
vendors these under `assets/vendor/piper/` along with each upstream licence
file; nothing is fetched from a CDN at play time.

- `@mintplex-labs/piper-tts-web` version 1.0.5, a fork of
  `@diffusion-studio/vits-web`.
  - Source: <https://github.com/Mintplex-Labs/piper-tts-web>
  - Upstream synthesiser: <https://github.com/rhasspy/piper>
  - License: MIT. Installed at `assets/vendor/piper/PIPER-TTS-WEB-LICENSE`.
- `@diffusionstudio/piper-wasm`, the phonemiser WebAssembly build.
  - License: MIT. Installed at `assets/vendor/piper/PIPER-WASM-LICENSE`.
- `onnxruntime-web` version 1.18.0, the inference runtime.
  - Source: <https://github.com/microsoft/onnxruntime>
  - License: MIT. Installed at `assets/vendor/piper/ONNXRUNTIME-LICENSE`.

### Voice model

The shipped voice is `en_GB-northern_english_male-medium` from the Rhasspy
Piper voice collection. Its model card is installed at
`assets/vendor/piper/en_GB-northern_english_male-medium-MODEL_CARD`.

The voice weights are distributed under the MIT licence, but they were trained
on a dataset released under **Creative Commons Attribution-ShareAlike 4.0
International**:

- Dataset: <http://www.openslr.org/83/>
- Dataset licence: CC-BY-SA 4.0

Distributing audio generated from this voice therefore carries an attribution
expectation, and the share-alike term may extend to the generated audio. Review
this before any commercial release, and select a differently licensed voice if
share-alike is unacceptable. The speech adapter is replaceable by design and the
voice is a single constructor argument.

## eSpeak NG (fallback voice)

eSpeak NG remains installed as the fallback used when the Piper model cannot be
loaded. Its GPL-3.0 terms continue to apply while it ships.
