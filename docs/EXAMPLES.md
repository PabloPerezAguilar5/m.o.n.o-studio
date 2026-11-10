# Ejemplos M.O.N.O. 0.1

Los ejemplos de la biblioteca se definen en `src/studio/examples.ts`. `tests/examples.test.ts` compila todos y comprueba que los que dependen de samples lo indiquen. Validar código no carga un kit ni confirma que sus archivos existan.

## Sintetizadores sin archivos externos

La sesión inicial **Afterhours** combina `sub`, `fm` y `pad`. Está disponible al abrir la aplicación y solo necesita pulsar PLAY. Para una prueba más breve, pega esto:

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

track signal {
  synth "fm"
  notes D4 F4 A4 C5
  arp updown
  rate 1/8
  delay 0.3
  reverb 0.35
  volume 0.35
}
```

Con la reproducción en marcha, cambia `cutoff 600` a `cutoff 1800` y pulsa Ctrl + Enter. El mismo instrumento recibe una rampa de filtro. Cambia después el patrón a `"x...x..x..x...x."`: entra en el siguiente límite de compás y el transporte continúa.

## Samples y generadores

El kit local `trip` está registrado en el catálogo de samples.

```mono
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
```

La biblioteca contiene este punto de partida como **Euclidean transmission**. El bombo euclidiano se repite; la caja se regenera cada cuatro compases; el hi-hat evoluciona conservando parte de su patrón. Cambia `kick euclid(5,16)` por `kick random(0.5) every 1 bar` para escuchar regeneración por probabilidad.

## Los otros algoritmos

El siguiente bloque usa el kit `glitch`, cuyos tres archivos deben estar en `public/samples/drums/glitch/`:

```mono
bpm 132
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
```

Este ejemplo aparece como **Broken machinery**. Sustituye `hat glitch(0.7) every 1 bar` por `hat dense(0.8)` para conservar una textura densa que se repite. `human` conserva una estructura base y añade velocidades y pequeños retrasos; no desplaza el transporte compartido. [GENERATORS.md](GENERATORS.md) explica las diferencias y límites de los ocho algoritmos.

## Recorrido manual de integración

1. Pulsa PLAY en Afterhours. Comprueba que el analizador muestra la salida real.
2. Modifica cutoff y volumen; aplica con Ctrl + Enter. Las pistas conservan su fase.
3. Añade una pista de sintetizador válida. Debe entrar en el siguiente compás sin reiniciar las otras.
4. Elimina esa pista y vuelve a aplicar. Debe retirarse en un límite de compás.
5. Escribe una nota fuera de escala, como `F#2` en `D_minor`, y aplica. Debe aparecer un diagnóstico mientras continúa la composición anterior.
6. Corrige el error. Aplica dos patrones diferentes dentro de un mismo compás. La última preparación válida debe ser la que entra.
7. Con tus WAV instalados, abre Euclidean transmission y aplica. Modifica un patrón de batería y observa que el tempo se mantiene.
8. Activa MUTE y SOLO; desactívalos para recuperar la salida sin reiniciar las secuencias.
9. Pulsa STOP y PLAY. La posición comienza de nuevo y los generadores reinician sus flujos de semilla.
10. Guarda con Ctrl + S, abre el proyecto desde la carpeta y exporta una copia `.mono`. Reimporta el archivo y aplícalo.

Este recorrido es una guía de comprobación manual, no una declaración de que se haya realizado una evaluación auditiva o una sesión de resistencia en cada navegador. Los datos y dobles de audio usados en pruebas automatizadas no sustituyen los samples que debes incorporar al proyecto.
