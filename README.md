# M.O.N.O. Studio

**Musical Orchestration & Noise Operations** · aplicación 0.1.0 · lenguaje 0.1

Instrumento local de live coding con React, TypeScript, Vite, Tone.js, Monaco y Zustand. Escribe código M.O.N.O., pulsa PLAY y cambia la composición con Ctrl + Enter mientras el transporte continúa. El compilador, el estado musical y el adaptador de audio están separados.

## Abrir localmente

Requiere Node.js **22.12 o posterior**, npm y un navegador moderno con Web Audio e IndexedDB.

```sh
npm install
npm run dev
```

Abre la dirección local que imprime Vite, normalmente `http://127.0.0.1:5173`. El proyecto debe servirse por HTTP; no abras `index.html` directamente. La instalación descarga las dependencias; la aplicación funciona después con sus recursos locales, sin backend, cuentas ni API externa. Monaco y su worker forman parte del build.

La composición inicial **Afterhours** utiliza tres sintetizadores y no necesita samples. Pulsa **PLAY** para habilitar el audio mediante una interacción explícita. Modifica `cutoff 600`, una nota o un patrón y pulsa **Ctrl + Enter** —o **⌘ + Enter**— para aplicar.

## Controles

| Control | Acción |
| --- | --- |
| PLAY | Compila el editor, prepara los instrumentos e inicia desde el principio. |
| STOP | Detiene el transporte, reinicia su posición, libera voces y descarta cambios pendientes. |
| RELOAD / Ctrl + Enter | Aplica el código válido; los cambios estructurales entran en el próximo compás. |
| BPM | Cambia el tempo compartido y la declaración `bpm` del editor. |
| MASTER | Ajusta el volumen maestro. |
| M / S | Silencia una pista o activa un solo sin alterar su fase musical. |
| SAVE / Ctrl + S | Guarda el proyecto en IndexedDB en este navegador. |
| Carpeta | Recupera proyectos locales y abre ejemplos en el editor. |
| Importar / Exportar | Abre o descarga código de texto con extensión `.mono`. |

Guardar conserva código, nombre, versión del lenguaje, volumen maestro y referencias a kits. El archivo `.mono` exportado contiene **solo el código**; guarda los WAV por separado. Abrir un proyecto o importar código no reemplaza automáticamente la composición que suena: aplícalo cuando esté listo. El guardado es explícito.

## Añadir batería real

**No se incluyen archivos WAV.** El manifiesto registra los kits `trip` y `glitch`, pero cada kit estará disponible únicamente cuando existan y se decodifiquen sus archivos. No hay batería sintetizada de sustitución ni descarga de sonidos.

Añade tus grabaciones a estas rutas:

```text
public/samples/drums/trip/kick.wav
public/samples/drums/trip/snare.wav
public/samples/drums/trip/hat.wav
public/samples/drums/glitch/kick.wav
public/samples/drums/glitch/snare.wav
public/samples/drums/glitch/hat.wav
```

Puedes empezar con un solo kit completo. Después abre **Euclidean transmission** para `trip` o **Broken machinery** para `glitch`. El motor carga el kit completo antes de aceptar una pista. Un archivo ausente o inválido produce un mensaje con su ruta y conserva la composición activa.

Para registrar otro kit, edita [`public/samples/kits.json`](public/samples/kits.json) y utiliza su `id` en `kit "mi_kit"`. Cada instrumento tiene una lista de rutas relativas a `public/samples/`. En v0.1 usa una muestra por instrumento para resultados uniformes. La estructura admite ampliar instrumentos y variaciones. Consulta [las instrucciones de samples](public/samples/README.md).

## Alcance de la versión

- 4/4, patrones de 16 semicorcheas, BPM entre 30 y 300; `rate` admite 1/4, 1/8 y 1/16.
- Escalas mayores y menores naturales; las notas fuera de escala se rechazan sin transposición.
- Presets `sub`, `analog`, `fm` y `pad`, con filtro, resonancia, volumen, delay y reverb por pista.
- Generadores `random`, `riot`, `evolve`, `minimal`, `dense`, `human`, `glitch` y `euclid`, semillas reproducibles y regeneración `every N bars`.
- Parámetros continuos suavizados; patrones, notas, altas, bajas y cambios de instrumento se aplican sin reiniciar el reloj compartido. Las pistas compatibles conservan sus nodos.
- Una sola versión estructural pendiente. Una compilación inválida conserva la composición válida; la última preparación válida sustituye a la pendiente anterior.
- Hasta 64 pistas, 128 notas por pista y 200 000 caracteres de código. La importación `.mono` limita archivos a 200 000 bytes. `every` admite de 1 a 1024 compases; `euclid` usa 16 pasos.
- Samples de hasta 20 MiB, 30 segundos y dos canales; hasta 64 MiB decodificados por kit. La caché conserva cuatro kits. Recarga la página después de reemplazar un archivo ya cargado.
- Ocho voces por sintetizador y cuatro reproductores por instrumento de batería. Las ráfagas generativas están acotadas.

No se implementan todavía IA, Supabase, MIDI, grabación ni sincronización en la nube. Existen interfaces para añadir adaptadores de audio, generadores y almacenamiento sin cambiar la gramática. Los ajustes de `pattern` y `arp`/`rate` son alternativas: no se combinan explícitamente en la misma pista.

## Verificar y construir

```sh
npm test
npm run typecheck
npm run build
npm run preview
```

El build estático queda en `dist/`. Las pruebas cubren lenguaje, generadores, semillas, diferencias, transacciones incrementales, límites de compás, conservación de pistas, preparación fallida, limpieza de recursos y compilación de ejemplos. Las pruebas unitarias de audio usan dobles de Tone y datos de prueba: esos datos no son un kit musical distribuido ni certifican la calidad auditiva o el comportamiento de una sesión prolongada en tu hardware.

## Documentación

- [Lenguaje y parámetros](docs/LANGUAGE.md)
- [Gramática y compilador](docs/GRAMMAR.md)
- [Arquitectura y contratos](docs/ARCHITECTURE.md)
- [Generadores y límites](docs/GENERATORS.md)
- [Semántica de actualizaciones en vivo](docs/LIVE_CODING.md)
- [Ejemplos y recorrido de integración](docs/EXAMPLES.md)

La integración del entorno sigue la [guía oficial de Vite](https://vite.dev/guide/), la [integración ESM de Monaco](https://github.com/microsoft/monaco-editor/blob/main/docs/integrate-esm.md) y el [transporte de Tone.js](https://github.com/Tonejs/Tone.js/wiki/Transport).
