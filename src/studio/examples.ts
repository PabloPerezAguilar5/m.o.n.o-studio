export const INITIAL_CODE = `// M.O.N.O. / AFTERHOURS
// Escribe. Ejecuta. Sigue tocando.
// Ctrl + Enter aplica los cambios en vivo.

bpm 95
scale D_minor
seed 12345

track bass {
    synth "sub"
    notes D2 D2 F2 C2
    pattern "x...x...x.x...x."
    cutoff 600
    volume 0.7
}

track signal {
    synth "fm"
    notes D4 F4 A4 C5
    arp updown
    rate 1/8
    cutoff 2800
    delay 0.3
    reverb 0.35
    volume 0.35
}

track atmosphere {
    synth "pad"
    notes D3 A3 F3 C4
    rate 1/4
    cutoff 1400
    reverb 0.6
    volume 0.24
}
`;

export const EXAMPLES = [
  { name: 'Afterhours', tag: 'SÍNTESIS · LISTO PARA TOCAR', code: INITIAL_CODE },
  { name: 'Euclidean transmission', tag: 'SAMPLES · KIT TRIP', code: `// Kit trip incluido en el catálogo local.
bpm 112
scale D_minor
seed 808

track drums {
    kit "trip"
    kick euclid(5,16)
    snare riot(0.6) every 4 bars
    hat evolve(0.3) every 1 bar
    volume 0.7
}

track bass {
    synth "sub"
    notes D2 F2 A2 C3
    pattern "x...x..x..x...x."
    cutoff 800
    volume 0.65
}
` },
  { name: 'Broken machinery', tag: 'SAMPLES · KIT GLITCH', code: `bpm 132
scale A_minor
seed 909

track machinery {
    kit "glitch"
    kick minimal(0.3)
    snare human(0.5) every 2 bars
    hat glitch(0.7) every 1 bar
    volume 0.6
}

track wire {
    synth "analog"
    notes A3 C4 E4 G4
    arp random
    rate 1/16
    cutoff 1600
    resonance 0.4
    delay 0.25
    volume 0.3
}
` },
  ...['909samples', 'samples808', 'freaksamples'].map(kit => ({ name: kit, tag: `SAMPLES · KIT ${kit.toUpperCase()}`, code: `bpm 120
track drums {
    kit "${kit}"
    kick "x...x...x...x..."
    snare riot(0.5) every 4 bars
    hat euclid(7,16)
    ${kit === 'freaksamples' ? 'perc' : 'clap'} random(0.3) every 2 bars
}
` })),
];
