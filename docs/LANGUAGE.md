# M.O.N.O. Language 0.1

## Referencia interactiva

M.O.N.O. Reference está disponible desde la barra lateral sin detener la música. Contiene descripciones y ejemplos para los comandos, presets, parámetros y generadores admitidos. Sus fichas de kits leen los instrumentos y variaciones del manifiesto. Las preescuchas usan una voz temporal y el volumen maestro, sin cambiar la composición.

El configurador de sintetizador valida las notas, el modo de escala, el nombre y los rangos antes de permitir copiar o insertar. Los avisos no bloquean la inserción. Las pistas generadas se añaden al final del editor; las líneas de generador se insertan en el cursor. Ninguna inserción aplica los cambios por sí sola.

El compilador transforma texto en AST y después en una composición musical tipada. Nunca ejecuta JavaScript. Los errores contienen línea, columna y longitud para Monaco. Si hay un error, `compile()` no devuelve composición; el llamador conserva la música válida anterior.

## Inicio rápido

```mono
bpm 95
scale D_minor
seed 12345

track bass {
  synth "sub"
  notes D2 F2 A2 C3
  pattern "x...x...x...x..."
  cutoff 600
  volume 0.65
}

track lead {
  synth "analog"
  notes D4 F4 A4 C5
  arp up
  rate 1/8
  delay 0.3
  reverb 0.5
}
```

Escribe una instrucción por línea. Los comentarios empiezan con `//`. Los comandos y nombres distinguen mayúsculas. Cada pista tiene un identificador único, comienza con `track nombre {` y termina con `}`. El orden de declaraciones globales y de propiedades no cambia su significado. Las propiedades repetidas producen un error.

## Globales

| Comando | Valor | Predeterminado |
| --- | --- | --- |
| `bpm` | Número entre 30 y 300 | 95 |
| `scale` | Raíz A–G, alteración `#` o `b` opcional, `_major` o `_minor` | D_minor |
| `scale_mode` | `free`, `suggest` o `strict` | suggest |
| `seed` | Entero entre 0 y 4294967295 | 12345 |

La métrica es 4/4. Las escalas menores son naturales. `Bb_major` y `F#_minor` son válidas. Las notas se escriben con letra mayúscula, alteración opcional y octava 0–8, como `D2`, `F#4`, `Bb3`. La validación trata las equivalencias enarmónicas como la misma clase de altura.

`scale_mode suggest` es el valor predeterminado, también para los proyectos anteriores: una nota válida fuera de escala produce un aviso y la composición se reproduce. Monaco muestra alternativas cercanas mediante acciones rápidas, que solo cambian el código si las eliges. `scale_mode free` acepta cualquier nota válida sin avisos; `scale_mode strict` rechaza las notas que no pertenecen a la escala. La escala sigue guardándose como referencia en todos los modos y las notas nunca se corrigen ni transponen automáticamente.

```mono
scale E_minor
scale_mode suggest // usa free para omitir avisos o strict para exigir la escala
track bass {
  synth "analog"
  notes E2 F2 G2 Bb2
  pattern "x...x...x...x..."
}
```

## Pistas

Cada pista declara exactamente un instrumento: `kit "nombre"` o `synth "preset"`. Los presets son `sub`, `analog`, `fm` y `pad`. El nombre de kit es un identificador local, con letras, números, `_` o `-`; el motor de audio comprueba el manifiesto y los archivos antes de activarlo. Compilar el nombre de un kit no significa que sus samples existan.

Las pistas de batería necesitan al menos un patrón para cualquier instrumento del kit. Consulta el catálogo en la guía de la aplicación o en `public/samples/kits.json`. Todos admiten patrones y generadores. Las pistas de sintetizador necesitan `notes` con entre 1 y 128 notas. `kit` no admite `notes`, `pattern`, `arp` ni `rate`; `synth` no admite líneas de batería.

```mono
track drums {
  kit "trip"
  kick "x...x...x...x..."
  snare "....x.......x..."
  hat euclid(7,16) every 2 bars
}
```

Cada patrón literal tiene exactamente 16 caracteres: `x` es golpe y `.` silencio. Cada carácter representa una semicorchea; el patrón completo dura un compás. Los sintetizadores con `pattern` recorren las notas declaradas, avanzando solamente con los pasos activos.

Una pista `synth` con `pattern` válido muestra automáticamente un secuenciador de 16 botones en su tarjeta. Cada botón cambia el carácter correspondiente en el código; el audio cambia al aplicar con Ctrl + Enter. Ctrl + Z deshace la edición visual. Las notas bajo los pasos siguen el orden de la lista y avanzan solo en los golpes; si el patrón del editor coincide con el activo, muestran el orden del compás actual. Los patrones sin aplicar muestran la primera vuelta.

Sin `pattern`, el sintetizador usa un arpegiador: `arp up`, `down`, `updown` o `random`, con `rate 1/4`, `1/8` o `1/16`. Los valores predeterminados son `up` y `1/8`. No se combina `pattern` con declaraciones explícitas `arp` o `rate`: el patrón ya fija posiciones de semicorchea.

## Parámetros

| Parámetro | Rango | Predeterminado |
| --- | --- | --- |
| `volume` | 0–1 | 0.65 |
| `cutoff` | 20–20000 Hz | 2400 |
| `resonance` | 0–1 | 0.15 |
| `delay` | 0–1 | 0 |
| `reverb` | 0–1 | 0.12 |

Los parámetros son independientes para cada pista. Los cambios de parámetros continuos se aplican mediante automatización del motor de audio. El lenguaje no depende de Tone.js.

## Generadores

`random`, `riot`, `evolve`, `minimal`, `dense`, `human` y `glitch` reciben una intensidad entre 0 y 1. `euclid(golpes,16)` recibe un entero entre 0 y 16 golpes. Los generadores se admiten en las líneas de batería.

```mono
kick random(0.4)
snare riot(0.8) every 4 bars
hat evolve(0.3) every 1 bar
```

Sin `every`, el resultado se genera una vez y se repite. `every N bar` y `every N bars` regeneran cada N compases, con N entero entre 1 y 1024. La semilla permite reproducir una composición al comenzar desde el inicio. Consulta [GENERATORS.md](GENERATORS.md) para los algoritmos y límites musicales.

## Límites y extensiones

El compilador admite hasta 200 000 caracteres, 64 pistas y nombres de hasta 64 caracteres. Una composición sin pistas es válida: permite retirar todas las pistas durante la ejecución. Se devuelven hasta 100 diagnósticos por etapa para mantener una respuesta acotada.

La API `compile(source, { generators })` acepta reglas de validación adicionales con `{ arity, validate(args) }`; el registro de generadores del núcleo debe contener el algoritmo correspondiente. Agregar una función generativa no requiere cambiar el lexer ni el parser.

## Mute y solo por pista

Dentro de cualquier `track`, escribe `mute true` o `mute false`, y `solo true` o `solo false`. Ambos valores son `false` cuando se omiten. Puede haber varios solos: se oyen las pistas con `solo true` siempre que no tengan `mute true`. Mute tiene prioridad. Los botones M y S actualizan estas mismas instrucciones en el editor y el estado activo; Ctrl + Enter aplica cambios escritos a mano.

```mono
track drums {
  kit "909samples"
  mute false
  solo true
  kick "x...x...x...x..."
  snare "....x.......x..."
}
```

## Biblioteca y autocompletado de patrones

Abre **PATTERN LIBRARY** desde la barra lateral. Filtra por estilo o instrumento, inserta una instrucción en el cursor o copia el texto. Si el cursor está en una línea de patrón, se sustituye solo esa instrucción. Guarda patrones propios de 16 pasos en IndexedDB; permanecen en este navegador. La inserción edita el texto y no aplica la composición: usa Ctrl + Enter.

Al escribir una línea como `snare "....x`, Monaco propone patrones compatibles. Acepta uno con Tab; se conservan los pasos escritos y se completa la comilla. La biblioteca y el catálogo de sugerencias son independientes del motor de audio.
