import { renderPairRgba } from "/core/engine.mjs";
import { frameNumberAt } from "/core/timing.mjs";

const canvas = document.querySelector("#scene");
const context = canvas.getContext("2d", { alpha: false });
const controls = document.querySelector("#controls");
const form = document.querySelector("#control-form");
const status = document.querySelector("#status");
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
  status.textContent = `Layers ${state.layer1} + ${state.layer2}`;
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
  const response = await fetch("/api/state", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(update),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `state update failed (${response.status})`);
  applyState(result);
}

async function randomize() {
  const response = await fetch("/api/randomize", {
    method: "POST",
    headers: { "content-type": "application/json" },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `randomize failed (${response.status})`);
  applyState(result);
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
    if (name === "speed") document.querySelector("#speed-value").value = `${fields[name].value}%`;
  });
  fields[name].addEventListener("change", () => {
    report(() => sendUpdate({ [name]: Number(fields[name].value) }));
  });
}
document.querySelector("#play-toggle").addEventListener("click", () => {
  report(() => sendUpdate({ playing: !state.playing }));
});
document.querySelector("#randomize").addEventListener("click", () => report(randomize));
document.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement) return;
  if (event.key.toLowerCase() === "c") controls.classList.toggle("hidden");
  if (event.key.toLowerCase() === "r") report(randomize);
  if (event.code === "Space") {
    event.preventDefault();
    report(() => sendUpdate({ playing: !state.playing }));
  }
});

function animate(now) {
  if (data && nativeData && state) {
    const frameNumber = currentFrame(now);
    if (frameNumber !== lastRenderedFrame) {
      const rgba = renderPairRgba({
        data,
        nativeData,
        layer1: state.layer1,
        layer2: state.layer2,
        frameNumber,
      });
      context.putImageData(new ImageData(rgba, canvas.width, canvas.height), 0, 0);
      lastRenderedFrame = frameNumber;
    }
  }
  requestAnimationFrame(animate);
}

async function start() {
  const [dataResponse, nativeResponse, stateResponse] = await Promise.all([
    fetch("/data/layers.json"),
    fetch("/data/native-data.json"),
    fetch("/api/state"),
  ]);
  if (![dataResponse, nativeResponse, stateResponse].every((response) => response.ok)) {
    throw new Error("failed to load the renderer data or player state");
  }
  [data, nativeData] = await Promise.all([dataResponse.json(), nativeResponse.json()]);
  applyState(await stateResponse.json());

  const events = new EventSource("/api/events");
  events.addEventListener("state", (event) => applyState(JSON.parse(event.data)));
  events.addEventListener("error", () => {
    status.textContent = "Control connection interrupted; reconnecting…";
  });
  requestAnimationFrame(animate);
}

report(start);
