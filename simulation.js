// ── Time & simulation state ───────────────────────────────────────────────────

const ERAS = [
  { name:'Era Primitiva',        start:1      },
  { name:'Era de Piedra',        start:100    },
  { name:'Era del Bronce',       start:400    },
  { name:'Era del Hierro',       start:1000   },
  { name:'Era Clásica',          start:2500   },
  { name:'Era Medieval',         start:5000   },
  { name:'Renacimiento',         start:8000   },
  { name:'Era Industrial',       start:12000  },
  { name:'Era Moderna',          start:25000  },
  { name:'Era Espacial',         start:60000  },
];

const SPEED_VALUES = [0, 1, 5, 20, 100, 500];
let speedIndex = 1;
let paused     = false;

let year      = 1;
let tickAccum = 0;
const BASE_MS_PER_YEAR = 2000; // ms per year at 1x — faster base pace

function getEra(y) {
  let era = ERAS[0];
  for (const e of ERAS) { if (y >= e.start) era = e; }
  return era;
}

function tickTime(deltaMs) {
  if (paused) return 0;
  const speed = SPEED_VALUES[speedIndex];
  tickAccum += deltaMs * speed;
  // Cap accumulator to prevent spiral of death — max 8 years per frame
  const maxAccum = BASE_MS_PER_YEAR * 8;
  if(tickAccum > maxAccum) tickAccum = maxAccum;
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
