import { renderPairRgba } from "/core/engine.mjs";
import { frameNumberAt, recordTempoTap } from "/core/timing.mjs";
import { createMicrophoneAudioInput, silentAudioFrame } from "/audio-input.mjs";
import { createGpuRenderer } from "/gpu-renderer.mjs";
import { createPlayerSession } from "/core/state.mjs";
import {
  createKonamiCodeMatcher,
  loadOpeningState,
  setControlsCollapsed,
  shouldConcealControls,
} from "/controls-panel.mjs";

let canvas = document.querySelector("#scene");
const controls = document.querySelector("#controls");
const controlsToggle = document.querySelector("#controls-toggle");
const form = document.querySelector("#control-form");
const status = document.querySelector("#status");
const audioStatus = document.querySelector("#audio-status");
const audioMeter = document.querySelector("#audio-meter-fill");
const audioToggle = document.querySelector("#audio-toggle");
const tapTempo = document.querySelector("#tap-tempo");
const reactivity = document.querySelector("#reactivity");
const fields = {
  layer1: document.querySelector("#layer1"),
  layer2: document.querySelector("#layer2"),
  brightness: document.querySelector("#brightness"),
  speed: document.querySelector("#speed"),
};

let data;
let nativeData;
let state;
let baseFrame = 0;
let startedAt = performance.now();
let lastRenderedFrame = -1;
let lastAudioRenderAt = -Infinity;
let renderer;
let rendererKind = "loading";
let audioInput;
let audioFrame = silentAudioFrame();
let tempoTaps = [];
let controlsCollapsed = false;
const playerSession = createPlayerSession();
const matchesKonamiCode = createKonamiCodeMatcher();

if (!shouldConcealControls(location.hostname)) {
  document.body.classList.remove("controls-concealed");
}
if (new URLSearchParams(location.search).has("display")) {
  document.body.classList.add("display-only");
}

function currentFrame(now = performance.now()) {
  if (!state) return 0;
  return frameNumberAt({
    baseFrame,
    elapsedMs: now - startedAt,
    speed: state.speed,
    playing: state.playing,
  });
}

function syncControls() {
  for (const [name, field] of Object.entries(fields)) field.value = state[name];
  document.querySelector("#brightness-value").value = `${state.brightness}%`;
  document.querySelector("#speed-value").value = `${state.speed}%`;
  document.querySelector("#play-toggle").textContent = state.playing ? "Pause" : "Play";
  canvas.style.filter = `brightness(${state.brightness}%)`;
  const stateMode = playerSession.synchronized ? "synced room" : "local only";
  status.textContent = `Layers ${state.layer1} + ${state.layer2} · ${rendererKind} · ${stateMode}`;
}

function applyState(next) {
  if (state && next.revision <= state.revision) return;
  const now = performance.now();
  baseFrame = currentFrame(now);
  startedAt = now;
  state = next;
  lastRenderedFrame = -1;
  syncControls();
}

async function sendUpdate(update) {
  applyState(await playerSession.update(update));
}

async function randomize() {
  applyState(await playerSession.randomize());
}

async function report(action) {
  try {
    await action();
  } catch (error) {
    status.textContent = error.message;
    status.classList.add("error");
  }
}

form.addEventListener("submit", (event) => event.preventDefault());
for (const name of ["layer1", "layer2", "brightness", "speed"]) {
  fields[name].addEventListener("input", () => {
    if (name === "brightness") document.querySelector("#brightness-value").value = `${fields[name].value}%`;
    if (name === "speed") {
      document.querySelector("#speed-value").value = `${fields[name].value}%`;
      tempoTaps = [];
      tapTempo.textContent = "Tap tempo";
    }
  });
  fields[name].addEventListener("change", () => {
    report(() => sendUpdate({ [name]: Number(fields[name].value) }));
  });
}
document.querySelector("#play-toggle").addEventListener("click", () => {
  report(() => sendUpdate({ playing: !state.playing }));
});
document.querySelector("#randomize").addEventListener("click", () => report(randomize));
controlsToggle.addEventListener("click", () => {
  controlsCollapsed = setControlsCollapsed(controls, controlsToggle, !controlsCollapsed);
});
tapTempo.addEventListener("click", () => {
  const reading = recordTempoTap(tempoTaps, performance.now());
  tempoTaps = reading.taps;
  if (reading.speed === null) {
    tapTempo.textContent = "Tap again";
    return;
  }
  tapTempo.textContent = `${reading.bpm} BPM`;
  fields.speed.value = reading.speed;
  document.querySelector("#speed-value").value = `${reading.speed}%`;
  report(() => sendUpdate({ speed: reading.speed }));
});
reactivity.addEventListener("input", () => {
  document.querySelector("#reactivity-value").value = `${reactivity.value}%`;
});
audioToggle.addEventListener("click", () => report(async () => {
  if (audioInput) {
    const previous = audioInput;
    audioInput = undefined;
    audioFrame = silentAudioFrame();
    await previous.stop();
    audioToggle.textContent = "Enable mic";
    audioStatus.textContent = "Audio reactivity off";
    audioMeter.style.width = "0";
    lastRenderedFrame = -1;
    return;
  }
  audioStatus.textContent = "Requesting microphone…";
  try {
    audioInput = await createMicrophoneAudioInput();
  } catch (error) {
    audioStatus.textContent = "Microphone unavailable";
    throw error;
  }
  audioToggle.textContent = "Disable mic";
  audioStatus.textContent = "Listening · SNES palette mode";
  lastRenderedFrame = -1;
}));
document.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement) return;
  if (matchesKonamiCode(event.key)) {
    document.body.classList.remove("controls-concealed", "display-only");
    controlsCollapsed = setControlsCollapsed(controls, controlsToggle, false);
  }
  if (event.key.toLowerCase() === "c") {
    controlsCollapsed = setControlsCollapsed(controls, controlsToggle, !controlsCollapsed);
  }
  if (event.key.toLowerCase() === "r") report(randomize);
  if (event.code === "Space") {
    event.preventDefault();
    report(() => sendUpdate({ playing: !state.playing }));
  }
});

function animate(now) {
  if (data && nativeData && state && renderer) {
    const frameNumber = currentFrame(now);
    const audioFrameDue = audioInput && now - lastAudioRenderAt >= 1_000 / 30;
    if (frameNumber !== lastRenderedFrame || audioFrameDue) {
      if (audioInput) {
        audioFrame = audioInput.sample();
        lastAudioRenderAt = now;
        const level = Math.round(audioFrame.features.rms * 100);
        audioMeter.style.width = `${level}%`;
        audioStatus.textContent = `Listening · level ${level}% · SNES palette mode`;
      }
      renderer.render({
        layer1: state.layer1,
        layer2: state.layer2,
        frameNumber,
        intensity: audioInput ? Number(reactivity.value) / 100 : 0,
        audio: audioFrame,
      });
      lastRenderedFrame = frameNumber;
    }
  }
  requestAnimationFrame(animate);
}

async function start() {
  const [dataResponse, nativeResponse, initialState] = await Promise.all([
    fetch("/data/layers.json"),
    fetch("/data/native-data.json"),
    loadOpeningState(playerSession),
  ]);
  if (![dataResponse, nativeResponse].every((response) => response.ok)) {
    throw new Error("failed to load the renderer data");
  }
  [data, nativeData] = await Promise.all([dataResponse.json(), nativeResponse.json()]);
  try {
    renderer = createGpuRenderer(canvas, data, nativeData);
    rendererKind = "WebGL 2 · native textures";
  } catch (error) {
    const replacement = canvas.cloneNode();
    canvas.replaceWith(replacement);
    canvas = replacement;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw error;
    renderer = {
      render({ layer1, layer2, frameNumber }) {
        const rgba = renderPairRgba({ data, nativeData, layer1, layer2, frameNumber });
        context.putImageData(new ImageData(rgba, canvas.width, canvas.height), 0, 0);
      },
    };
    rendererKind = "exact CPU fallback";
    audioToggle.disabled = true;
    audioStatus.textContent = `Audio visuals unavailable · ${error.message}`;
  }
  applyState(initialState);

  playerSession.subscribe(applyState, () => {
    status.textContent = "Control connection interrupted; reconnecting…";
  });
  requestAnimationFrame(animate);
}

report(start);
