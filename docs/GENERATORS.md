# Generadores M.O.N.O. 0.1

Los ocho generadores funcionan sobre baterías de 16 semicorcheas por compás, en 4/4. `x` es golpe y `.` silencio. El resultado es una lista de golpes con velocidad y desplazamiento temporal por paso. El motor reproduce samples; los algoritmos no sintetizan batería.

```mono
seed 12345
track drums {
  kit "trip"
  kick euclid(5,16)
  snare human(0.5)
  hat evolve(0.3) every 2 bars
}
```

Cada intensidad está en 0..1. Las propiedades son deliberadamente distintas:

| Comando | Semántica y límites |
| --- | --- |
| `random(p)` | Prueba Bernoulli independiente en cada paso. Densidad esperada `16*p`, máximo un golpe por paso. Cero produce silencio; uno activa todos. |
| `riot(i)` | Grupos con separación irregular, acentos en pulsos fuertes y ráfagas de hasta tres golpes por paso. La intensidad acorta los espacios y aumenta las ráfagas. |
| `evolve(i)` | Parte de cuatro pulsos; en cada generación invierte hasta `round(4*i)` posiciones distintas del patrón anterior. Conserva al menos doce posiciones. Cero conserva toda la estructura. |
| `minimal(i)` | Entre uno y cuatro golpes espaciados uniformemente con una rotación pseudoaleatoria de hasta tres pasos. Cero mantiene un único golpe. |
| `dense(i)` | Parte de dieciséis golpes acentuados y elimina `round(8*(1-i))` posiciones débiles. Conserva los pulsos fuertes; entre ocho y dieciséis golpes. |
| `human(i)` | Mantiene un patrón base por instrumento: kick en 0/8, snare en 4/12, hat en pasos pares. Modifica velocidades y retrasa golpes hasta 12 ms (también limitado al 12% de una semicorchea), escalado por intensidad. No anticipa golpes al compás anterior. |
| `glitch(i)` | Divide el compás en fragmentos de cuatro pasos, corta fragmentos, desplaza sus anclas y añade repeticiones descendentes y dobles golpes. Máximo dos golpes por paso. |
| `euclid(k,16)` | Algoritmo de distribución entera de `k` pulsos por 16 pasos, con las separaciones más uniformes posibles y primer golpe en el paso cero. Admite 0..16 pulsos. |

## Regeneración y semillas

Sin `every`, el generador se evalúa una vez y repite exactamente ese resultado, incluyendo velocidades y desplazamientos. `every N bar` o `every N bars` regenera al inicio de cada N compases desde la entrada del patrón. `evolve` recibe su resultado previo. Añadir una pista no desplaza los flujos aleatorios de las demás: cada pista e instrumento tiene su propia semilla derivada de `seed` y de su nombre.

STOP y PLAY reinician los flujos. La misma composición, semilla y BPM desde el inicio produce la misma secuencia. Cambiar `seed` se aplica en el siguiente límite de compás y reinicia los generadores. Las ediciones de estructura reinician el generador de la pista afectada; los controles continuos conservan su estado.

Los algoritmos usan Mulberry32, no `Math.random`. La reproducibilidad se refiere a los eventos musicales, no a una identidad binaria de audio entre navegadores.

## Seguridad temporal y extensión

El registro `generatorRegistry` acepta definiciones con `registerGenerator({name, generate})`. `generatePattern` limita cualquier salida registrada a 16 pasos, tres golpes por paso, velocidades 0..1 y offsets no negativos de hasta el 80% de una semicorchea. No hay temporizadores por golpe: el scheduler de transporte envía cada evento con su tiempo exacto al adaptador de audio. Al acelerar el BPM, los offsets del patrón almacenado se vuelven a limitar para no invadir el siguiente paso.

Para exponer un nuevo generador en el lenguaje, registra también sus reglas de argumentos en las opciones del compilador. No es necesario modificar el parser ni el motor de audio. La tipificación inicial de nombres documenta los ocho generadores incluidos.
