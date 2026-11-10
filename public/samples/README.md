# Samples locales

No se incluyen grabaciones ni se descargan samples. Los kits `trip` y `glitch`
están registrados, pero **no están disponibles** hasta añadir sus archivos.

Coloca tus archivos con licencia adecuada en:

```
public/samples/drums/trip/kick.wav
public/samples/drums/trip/snare.wav
public/samples/drums/trip/hat.wav
public/samples/drums/glitch/kick.wav
public/samples/drums/glitch/snare.wav
public/samples/drums/glitch/hat.wav
```

Cada sample admite hasta 20 MiB, 30 segundos y dos canales; cada kit hasta 64 MiB
de audio decodificado. Usa WAV PCM para
la mayor compatibilidad; otros formatos dependen de la decodificación del navegador.

Puedes crear otro directorio y registrar un kit en `public/samples/kits.json`.
El id se utiliza en `kit "mi_kit"`. Las rutas son relativas a `public/samples/`;
no se permiten URLs externas ni rutas que salgan del directorio. Cada entrada
de `instruments` es una lista, preparada para más instrumentos y variaciones.
En v0.1 el lenguaje expone kick, snare y hat; cuatro reproductores por instrumento
limitan la polifonía y alternan sus buffers. Para resultados uniformes utiliza una
variación por instrumento.

El motor descarga y decodifica el kit completo antes de aceptar una pista.
Un archivo ausente, inválido o no decodificable rechaza la actualización y mantiene
la composición activa. Los fallos no quedan cacheados: añade el archivo y vuelve
a aplicar. Los kits cargados correctamente se conservan en una caché de cuatro
kits por sesión; recarga la página después de reemplazar un archivo ya cacheado.
La declaración en el manifiesto por sí sola nunca implica que un kit esté listo.
