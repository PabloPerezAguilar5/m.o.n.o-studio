import { DEFAULT_PARAMS } from '../core/types';

export const SYNTH_PRESETS = [
  { id: 'sub', type: 'Sustractiva · seno', sound: 'Grave suave y profundo, con pocos armónicos.', uses: 'Bajos, subgraves y pulsos cálidos.', note: 'D2' },
  { id: 'analog', type: 'Sustractiva · sierra', sound: 'Brillante y con cuerpo; el filtro permite oscurecerlo.', uses: 'Bajos con carácter, melodías y secuencias.', note: 'D3' },
  { id: 'fm', type: 'Modulación de frecuencia', sound: 'Metálico y definido, con armónicos cambiantes.', uses: 'Campanas, líneas rítmicas y sonidos digitales.', note: 'D4' },
  { id: 'pad', type: 'Sustractiva · sierras', sound: 'Amplio y envolvente, con ataque y cola lentos.', uses: 'Atmósferas, acordes y fondos sostenidos.', note: 'D4' },
] as const;
export type SynthPreset = typeof SYNTH_PRESETS[number]['id'];
export const SCALE_MODES = [
  { id: 'free', description: 'Libertad cromática total: cualquier nota válida, sin advertencias.' },
  { id: 'suggest', description: 'Permite cualquier nota válida y advierte si está fuera de la escala.' },
  { id: 'strict', description: 'Rechaza las notas que no pertenecen a la escala.' },
] as const;
export const PARAMETER_LIMITS = {
  volume: { min: 0, max: 1, default: DEFAULT_PARAMS.volume }, cutoff: { min: 20, max: 20000, default: DEFAULT_PARAMS.cutoff },
  resonance: { min: 0, max: 1, default: DEFAULT_PARAMS.resonance }, delay: { min: 0, max: 1, default: DEFAULT_PARAMS.delay }, reverb: { min: 0, max: 1, default: DEFAULT_PARAMS.reverb },
} as const;
export interface LanguageEntry { name: string; category: 'global' | 'track' | 'synth' | 'drums' | 'effect' | 'generator'; description: string; values: string; defaultValue: string; example: string; error: string }
const entry = (name: string, category: LanguageEntry['category'], description: string, values: string, defaultValue: string, example: string, error: string): LanguageEntry => ({ name, category, description, values, defaultValue, example, error });
const parameter = (name: keyof typeof PARAMETER_LIMITS, description: string, example: string): LanguageEntry => { const rule = PARAMETER_LIMITS[name]; return entry(name, 'effect', description, `${rule.min}–${rule.max}${name === 'cutoff' ? ' Hz' : ''}`, String(rule.default), example, `Usar un valor fuera de ${rule.min}–${rule.max}.`); };
export const LANGUAGE_REFERENCE: LanguageEntry[] = [
  entry('track', 'global', 'Define una pista con nombre único y un bloque de instrucciones.', 'Identificador y llaves; hasta 64 pistas.', 'No hay pistas.', 'track lead {\n    synth "analog"\n    notes D4 F4 A4\n}', 'Repetir nombres o no cerrar la llave.'),
  entry('bpm', 'global', 'Controla la velocidad del transporte.', '30–300 BPM.', '95', 'bpm 120', 'Usar valores fuera del rango.'),
  entry('scale', 'global', 'Define la escala de referencia para las notas; scale_mode decide cómo se tratan las notas ajenas.', 'Raíz A–G, # o b opcional y _major o _minor.', 'D_minor', 'scale E_minor', 'Escribir E minor con espacio o usar una escala no admitida.'),
  entry('scale_mode', 'global', 'Con scale E_minor, F2 suena sin avisos en free, suena con un aviso en suggest y se rechaza en strict. Nunca transpone notas.', 'free, suggest o strict.', 'suggest', 'scale E_minor\nscale_mode suggest', 'Usar comillas o un modo distinto de free, suggest y strict.'),
  entry('seed', 'global', 'Fija la semilla para repetir las secuencias aleatorias desde el inicio.', 'Entero entre 0 y 4294967295.', '12345', 'seed 808', 'Usar un valor negativo o decimal.'),
  entry('kit', 'drums', 'Elige el kit local de una pista de batería.', 'Nombre de kit del manifiesto, entre comillas.', 'Obligatorio si no hay synth.', 'kit "909samples"', 'Omitir las comillas o combinar kit y synth.'),
  entry('synth', 'synth', 'Elige el preset de síntesis de la pista.', SYNTH_PRESETS.map(p => p.id).join(', '), 'Obligatorio si no hay kit.', 'synth "sub"', 'Usar un preset desconocido o combinar synth y kit.'),
  entry('notes', 'synth', 'Lista las notas que recorrerá el sintetizador sin transponerlas.', '1–128 notas A–G con octava 0–8; scale_mode decide si se admiten notas fuera de escala.', 'Obligatorio en pistas synth.', 'notes D2 F2 A2 C3', 'Usar comillas, omitir la octava o escribir una nota inválida.'),
  entry('pattern', 'synth', 'Fija los golpes de una pista de sintetizador; cada x avanza a la siguiente nota.', 'Cadena de exactamente 16 caracteres x y punto.', 'Sin patrón: arpegiador.', 'pattern "x...x...x...x..."', 'Combinar pattern con arp o rate.'),
  entry('arp', 'synth', 'Define el orden de las notas cuando no hay pattern.', 'up, down, updown o random.', 'up', 'arp updown', 'Combinar arp con pattern.'),
  entry('rate', 'synth', 'Define el intervalo del arpegiador.', '1/4, 1/8 o 1/16.', '1/8', 'rate 1/16', 'Combinar rate con pattern o usar otra fracción.'),
  entry('mute', 'track', 'Silencia la pista sin detener su secuenciador.', 'true o false.', 'false', 'mute true', 'Usar 1 o escribir el valor entre comillas.'),
  entry('solo', 'track', 'Aísla esta pista junto a las demás con solo; mute tiene prioridad.', 'true o false.', 'false', 'solo true', 'Suponer que solo anula mute.'),
  entry('instrumento de batería', 'drums', 'Cada nombre del kit define una línea de golpes.', 'Nombre disponible en el kit y patrón literal o generador.', 'Debe haber al menos una línea de batería.', 'kick "x...x...x...x..."', 'Usar un instrumento que no existe en el kit.'),
  parameter('volume', 'Ajusta el nivel de la pista.', 'volume 0.5'),
  parameter('cutoff', 'Abre o cierra el filtro pasa bajos: valores bajos oscurecen el sonido; valores altos dejan pasar más agudos.', 'cutoff 1800'),
  parameter('resonance', 'Realza las frecuencias alrededor del cutoff.', 'resonance 0.3'),
  parameter('delay', 'Mezcla repeticiones rítmicas con la señal original.', 'delay 0.25'),
  parameter('reverb', 'Mezcla una cola de reverberación para dar espacio.', 'reverb 0.3'),
  entry('every', 'drums', 'Regenera un patrón generado cada N compases.', 'Entero 1–1024 seguido de bar o bars.', 'Sin every se genera una vez y se repite.', 'hat evolve(0.3) every 2 bars', 'Usarlo con un patrón literal o con cero compases.'),
];
export interface GeneratorInfo extends LanguageEntry { syntax: string; demo: string; args: number[] }
const generator = (name: string, description: string, demo: string, args: number[]): GeneratorInfo => {
  const syntax = name === 'euclid' ? 'euclid(golpes,16)' : `${name}(intensidad)`;
  const values = name === 'euclid' ? 'Golpes: entero 0–16; pasos: exactamente 16.' : 'Intensidad: 0–1.';
  return { ...entry(name, 'generator', description, values, 'Sin every: se genera una vez.', `hat ${demo} every 2 bars`, name === 'euclid' ? 'Usar otra cantidad de pasos o más golpes que pasos.' : 'Usar intensidad fuera de 0–1.'), syntax, demo, args };
};
export const GENERATORS: GeneratorInfo[] = [
  generator('random', 'Activa pasos al azar según la densidad.', 'random(0.4)', [0.4]),
  generator('riot', 'Crea acentos sincopados y ráfagas de golpes.', 'riot(0.7)', [0.7]),
  generator('evolve', 'Muta unos pocos pasos del patrón previo en cada regeneración.', 'evolve(0.3)', [0.3]),
  generator('minimal', 'Distribuye unos pocos golpes con una rotación aleatoria.', 'minimal(0.3)', [0.3]),
  generator('dense', 'Llena la mayoría de los pasos y deja algunos huecos.', 'dense(0.8)', [0.8]),
  generator('human', 'Usa un ritmo base con variaciones suaves de velocidad y retraso.', 'human(0.5)', [0.5]),
  generator('glitch', 'Construye fragmentos cortos, cortes y repeticiones.', 'glitch(0.8)', [0.8]),
  generator('euclid', 'Distribuye golpes de forma uniforme en 16 pasos.', 'euclid(7,16)', [7, 16]),
];
export const ALL_REFERENCE = [...LANGUAGE_REFERENCE, ...GENERATORS];
export const referenceFor = (name: string) => ALL_REFERENCE.find(item => item.name === name);
