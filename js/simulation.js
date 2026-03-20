// ── Time & simulation state ───────────────────────────────────────────────────

const ERAS = [
  { name:'Era Primitiva',        start:1      },
  { name:'Era de Piedra',        start:200    },
  { name:'Era del Bronce',       start:800    },
  { name:'Era del Hierro',       start:2000   },
  { name:'Era Medieval',         start:5000   },
  { name:'Renacimiento',         start:10000  },
  { name:'Era Industrial',       start:20000  },
  { name:'Era Moderna',          start:50000  },
];

const SPEED_VALUES = [0, 1, 5, 20, 100];
let speedIndex = 1;
let paused     = false;

let year      = 1;
let tickAccum = 0;
const BASE_MS_PER_YEAR = 3000; // ms per year at 1x — slow enough to watch society develop

function getEra(y) {
  let era = ERAS[0];
  for (const e of ERAS) { if (y >= e.start) era = e; }
  return era;
}

function tickTime(deltaMs) {
  if (paused) return 0;
  const speed = SPEED_VALUES[speedIndex];
  tickAccum += deltaMs * speed;
  let elapsed = 0;
  while (tickAccum >= BASE_MS_PER_YEAR) {
    tickAccum -= BASE_MS_PER_YEAR;
    year++;
    elapsed++;
  }
  return elapsed;
}

function formatYear(y) {
  return y <= 0 ? `${Math.abs(y - 1)} a.C.` : `Año ${y.toLocaleString()}`;
}
