# Kits locales

El catálogo contiene los kits 909samples, freaksamples, glitch, samples808 y trip. Consulta sus instrumentos y rutas originales en kits.json o la guía del editor. Las variantes de un instrumento se alternan en cada golpe.

Para registrar archivos nuevos, añade carpetas o WAV en drums/ y ejecuta `node scripts/register-kits.mjs`. El script clasifica nombres conocidos y crea un identificador para los demás. Revisa el resultado antes de usarlo. Cada ruta es relativa a samples/; no se modifican los WAV.

Cada sample admite 20 MiB, 30 segundos y dos canales, y cada kit 64 MiB decodificados. El motor carga el kit completo antes de aplicar la composición. Un error identifica el archivo y conserva la composición activa. Recarga la página si cambias archivos que ya estaban en caché.
