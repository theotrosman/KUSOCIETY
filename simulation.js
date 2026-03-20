// Simulation state & time management

const ERAS = [
  { name: 'Era Primitiva',   start: 1     },
  { name: 'Era de Piedra',   start: 200   },
  { name: 'Era del Bronce',  start: 800   },
  { name: 'Era del Hierro',  start: 2000  },
  { name: 'Era Medieval',    start: 5000  },
  { name: 'Era del Renacimiento', start: 10000 },
  { name: 'Era Industrial',  start: 20000 },
  { name: 'Era Moderna',     start: 50000 },
];

const SPEEDS = [0, 1, 5, 20, 100]; // 0 = paused
let speedIndex = 1;
let paused = false;

let year = 1;
let tickAccum = 0; // accumulated ms

// ms per in-game year at 1x speed
const BASE_MS_PER_YEAR = 800;

function getEra(y) {
  let era = ERAS[0];
  for (const e of ERAS) {
    if (y >= e.start) era = e;
  }
  return era;
}

function getSpeed() {
  return paused ? 0 : SPEEDS[speedIndex];
}

function tickTime(deltaMs) {
  if (paused) return 0;
  const speed = SPEEDS[speedIndex];
  tickAccum += deltaMs * speed;
  let yearsElapsed = 0;
  while (tickAccum >= BASE_MS_PER_YEAR) {
    tickAccum -= BASE_MS_PER_YEAR;
    year++;
    yearsElapsed++;
  }
  return yearsElapsed;
}

function formatYear(y) {
  if (y <= 0) return `${Math.abs(y - 1)} a.C.`;
  return `Año ${y}`;
}
