# Gramática M.O.N.O. 0.1

La implementación usa un lexer por caracteres y un parser descendente. Los saltos de línea separan instrucciones; las llaves delimitan pistas. No se evalúan expresiones, variables, bucles, JavaScript ni llamadas arbitrarias.

```ebnf
program       = { blank | global | track } ;
global        = ( "bpm" number | "scale" identifier | "scale_mode" identifier | "seed" number ) end ;
track         = "track" identifier "{" { blank | statement } "}" end ;
statement     = instrument | drum | notes | pattern | arp | rate | parameter ;
instrument    = ( "kit" | "synth" ) string end ;
drum          = identifier rhythm end ;
rhythm        = string | generator ;
generator     = identifier "(" number { "," number } ")"
                [ "every" number ( "bar" | "bars" ) ] ;
notes         = "notes" identifier { identifier } end ;
pattern       = "pattern" string end ;
arp           = "arp" identifier end ;
rate          = "rate" number "/" number end ;
parameter     = ( "volume" | "cutoff" | "resonance" | "delay" | "reverb" ) number end ;
number        = [ "-" ] digit { digit } [ "." digit { digit } ] ;
identifier    = ( letter | "_" ) { letter | digit | "_" | "#" | "-" } ;
string        = '"' { character | '\\"' | '\\\\' } '"' ;
blank         = newline ;
end           = newline | before_closing_brace | end_of_file ;
```

Espacios y tabulaciones se ignoran fuera de cadenas. `//` inicia un comentario hasta el fin de línea; dentro de una cadena son caracteres normales. Las cadenas no pueden contener saltos de línea. Se admiten escapes para comilla doble y barra inversa. Los identificadores léxicos son deliberadamente amplios para notas y escalas; la validación restringe los nombres de pista y kit.

Las restricciones musicales se comprueban después del análisis sintáctico: el modo de escala, presets, exclusión kit/synth, parámetros, nombres únicos, longitudes de patrón, aridad y rangos de generadores. `scale_mode` acepta `free`, `suggest` o `strict`; el predeterminado es `suggest`. En ese modo, una nota ajena a la escala produce una advertencia sin bloquear la composición. El AST conserva ubicaciones de origen y la representación intermedia contiene solamente valores musicales validados.

`parse(source)` devuelve `{ ast, diagnostics }`. `validate(ast, options)` devuelve `{ composition?, diagnostics }`. `compile(source, options)` aplica ambas etapas y el límite de tamaño. No devuelve una composición si hay errores. El parser recupera errores en límites de línea o llaves para señalar varios problemas sin bloquearse.

Dentro de `track`, `mute` y `solo` admiten `true` o `false`:

```ebnf
track_flag = ( "mute" | "solo" ) ( "true" | "false" ) end ;
```

Si se omiten, ambos valores son `false`.
