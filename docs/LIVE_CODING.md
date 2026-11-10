# Actualizaciones en vivo

La composición compilada es un valor independiente de Tone.js. `LiveEngine` recibe exclusivamente composiciones validadas y usa `AudioBackend`; el editor conserva y muestra los diagnósticos de una compilación fallida sin llamar a `submit`.

## Transacción

1. El compilador analiza y valida el código completo.
2. `submit` toma una copia estable de la representación musical.
3. Solo prepara voces para pistas nuevas o cambios de kit/preset. La preparación de samples puede ser asíncrona.
4. Si falta un sample o falla una preparación, elimina los candidatos y conserva la composición activa. Las pistas existentes siguen sonando.
5. Compara la estructura y los parámetros con el estado activo.
6. Los parámetros continuos de voces compatibles y el BPM se aplican inmediatamente. Si no hay cambios estructurales, termina aquí.
7. Una única transacción estructural queda pendiente. La última preparación válida sustituye a la anterior y libera sus candidatos.
8. En el siguiente paso cero, instala la transacción: conserva voces compatibles, retira pistas eliminadas y activa las nuevas. No reinicia el transporte.

Una edición recibida mientras otra carga tiene un número de revisión. Si termina tarde, no puede sobrescribir una edición posterior y libera las voces que había preparado. Si un compás aplica una transacción mientras otra carga, la preparación se compara nuevamente con el estado actual antes de quedar pendiente. Una carga fallida no elimina una transacción válida que ya estaba pendiente.

## Tiempo musical

Existe un único callback de semicorchea del transporte compartido. No hay un loop adicional por pista, ni temporizadores de JavaScript como reloj musical. Cada callback decide los eventos del paso actual. Los cambios de estructura entran en el siguiente paso cero; si el transporte aún no emitió su primer paso, pueden entrar en ese primer compás. Tone programa con anticipación: una edición que llega después de planificar ese límite entra en el siguiente compás.

Los patrones de batería siempre ocupan 16 pasos. Las notas melódicas con `pattern` avanzan solo en pasos `x`. Sin `pattern`, `rate` determina la separación de notas. Los arpegios `up`, `down`, `updown` y `random` recorren la lista declarada; no ordenan ni transponen sus notas. `updown` no duplica las notas de los extremos. MUTE/SOLO cambian la salida de la voz, manteniendo su fase y su generación.

La interfaz recibe snapshots para dibujar posición y estado. Esos dibujos no controlan el reloj de audio y pueden adelantarse ligeramente al audio por la anticipación del scheduler. El sistema no pretende ofrecer una visualización con precisión de muestra.

## Recursos y transporte

Cambiar solo cutoff, volumen, resonancia, delay o reverb no crea otra voz. Cambiar notas o patrones tampoco reemplaza un instrumento compatible: solamente actualiza su planificación y reinicia el estado musical de esa pista. Un cambio de preset/kit prepara una nueva cadena y retira la anterior en el límite musical mediante el adaptador de audio. No quedan loops antiguos que puedan emitir notas duplicadas.

STOP cancela el reloj, reinicia la posición, descarta los cambios estructurales pendientes y libera todas las voces. Conserva la última composición activa. PLAY reconstruye sus voces cuando es necesario y comienza desde el principio con la misma semilla. El adaptador requiere interacción explícita para abrir el audio. Cerrar el motor libera también el bus maestro y sus efectos.

La unidad `LiveEngine` no ejecuta código del usuario ni depende de Tone.js. Otro backend, incluido uno MIDI, puede implementar el mismo contrato. El backend debe respetar el tiempo de los eventos y realizar disposiciones diferidas cuando recibe un tiempo de límite de compás; las llamadas a `dispose` deben ser idempotentes.

## Mute y solo en directo

Edita `mute true` o `solo true` dentro de una pista y pulsa Ctrl + Enter. Los cambios de audibilidad se aplican inmediatamente con una transición breve, sin reiniciar el transporte ni la fase de los patrones. Varias pistas pueden tener solo; mute tiene prioridad. Los botones M y S cambian la instrucción correspondiente del editor y la audibilidad activa, sin aplicar otros cambios pendientes del texto. Si además se cambia una estructura, esta espera al siguiente compás después de prepararse.

La biblioteca lateral inserta o reemplaza únicamente una instrucción del editor. Para escucharla, aplica el código con Ctrl + Enter.
