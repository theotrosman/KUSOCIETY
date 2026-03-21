// Noise helper — wraps simplex-noise v4 CDN bundle
// Uses a random seed each page load for unique worlds
function makeNoise2D(seed) {
  if (window.simplexNoise && window.simplexNoise.createNoise2D) {
    return window.simplexNoise.createNoise2D(seed ? alea(seed) : undefined);
  }
  if (typeof SimplexNoise !== 'undefined') {
    const sn = new SimplexNoise(seed ? alea(seed) : undefined);
    return (x, y) => sn.noise2D ? sn.noise2D(x,y) : sn.noise(x,y);
  }
  // Fallback pseudo-random
  const s = seed || 1;
  return (x, y) => {
    const n = Math.sin(x * 127.1 * s + y * 311.7) * 43758.5453;
    return (n - Math.floor(n)) * 2 - 1;
  };
}

// Simple seeded PRNG for noise (alea-style)
function alea(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// Fractal Brownian Motion
function fbm(noise, x, y, octaves, lacunarity, gain) {
  let v=0, amp=0.5, freq=1, max=0;
  for(let i=0;i<octaves;i++){
    v   += noise(x*freq, y*freq)*amp;
    max += amp; amp*=gain; freq*=lacunarity;
  }
  return v/max;
}

// Mulberry32 deterministic RNG
function mulberry32(seed) {
  return function(){
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed>>>15, 1|seed);
    t = t + Math.imul(t ^ t>>>7, 61|t) ^ t;
    return ((t ^ t>>>14)>>>0) / 4294967296;
  };
}

// Global world seed — new every reload
const WORLD_SEED = Math.floor(Math.random() * 0xFFFFFF);
