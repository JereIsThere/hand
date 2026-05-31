// Embed-Tools: bettet externe Seiten (projects, funkner) per iframe ein.
// Lazy-Load beim ersten Aktivieren, "neuer Tab"-Fallback, Blocked-Detection.
import { $$ } from '../shared/ui.js';

const loaded = new Set();

function wire(section) {
  const url = section.dataset.embed;
  const frame = section.querySelector('.embed-frame');
  const blocked = section.querySelector('.embed-blocked');
  const reloadBtn = section.querySelector('.embed-reload');

  // "neuer Tab"-Links mit der Ziel-URL versorgen
  section.querySelectorAll('.embed-open').forEach(a => { a.href = url; });

  let loadTimer = null;

  function showBlocked() {
    blocked.classList.remove('hidden');
    frame.classList.add('hidden');
  }
  function showFrame() {
    blocked.classList.add('hidden');
    frame.classList.remove('hidden');
  }

  function load() {
    showFrame();
    clearTimeout(loadTimer);
    // Manche Seiten setzen X-Frame-Options/CSP: dann feuert load nie sauber.
    // Heuristik: wenn nach 6s kein erfolgreiches load kam, Fallback zeigen.
    loadTimer = setTimeout(showBlocked, 6000);
    frame.src = url;
  }

  frame.addEventListener('load', () => {
    clearTimeout(loadTimer);
    // erfolgreich geladen (cross-origin: wir können den Inhalt nicht lesen,
    // aber das load-Event reicht als Lebenszeichen)
    showFrame();
  });

  reloadBtn?.addEventListener('click', load);

  section._embedLoad = load;
}

export function initEmbeds() {
  $$('.embed-tool').forEach(wire);
}

// Beim Aktivieren des Tools: iframe erst dann laden (spart Requests
// für Tools die der User nie öffnet).
export function activateEmbed(toolName) {
  const section = document.getElementById(`tool-${toolName}`);
  if (!section || !section.classList.contains('embed-tool')) return;
  if (!loaded.has(toolName)) {
    loaded.add(toolName);
    section._embedLoad?.();
  }
}
