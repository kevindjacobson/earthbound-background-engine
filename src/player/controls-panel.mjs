const KONAMI_CODE = Object.freeze([
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
]);

export function setControlsCollapsed(panel, button, collapsed) {
  panel.classList.toggle("collapsed", collapsed);
  button.setAttribute("aria-expanded", String(!collapsed));
  button.textContent = collapsed ? "Show controls" : "Hide controls";
  return collapsed;
}

export function loadOpeningState(playerSession) {
  return playerSession.synchronized ? playerSession.load() : playerSession.randomize();
}

export function shouldConcealControls(hostname) {
  return hostname.toLowerCase() !== "earf.justalilguy.com";
}

export function createKonamiCodeMatcher() {
  let position = 0;

  return (key) => {
    const normalizedKey = key.length === 1 ? key.toLowerCase() : key;
    if (normalizedKey === KONAMI_CODE[position]) {
      position += 1;
    } else {
      position = normalizedKey === KONAMI_CODE[0] ? 1 : 0;
    }

    if (position !== KONAMI_CODE.length) return false;
    position = 0;
    return true;
  };
}
