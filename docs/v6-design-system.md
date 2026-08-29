# V6 — sistema de diseño "terminal"

Guía de diseño extraída de la V6 de Trading Journal para poder aplicarse tal
cual a otra app. Es una estética de **terminal / programación retro**: fondo
negro, tipografía monoespaciada, prompts `$`, comentarios `//`, botones entre
corchetes `[así]` y esquinas cuadradas en vez de redondeadas. No hay tema
claro: es una decisión de diseño, no un descuido.

Todo lo de aquí está sacado literalmente del código (`src/app/page.js`,
`src/app/globals.css`, `src/app/layout.js` de este repo), no inventado.

---

## 1. Principios

1. **Solo oscuro.** Un fondo `#0A0A0A` fijo, sin variables de tema
   claro/oscuro. Menos superficie de CSS, y encaja con la estética.
2. **Cuadrado, no redondo.** `border-radius: 2px` en (casi) todo. Si algo en
   tu app actual usa `border-radius: 8–16px`, en V6 baja a 2px o 0.
3. **Monoespaciada en todo.** Una sola tipografía para toda la hoja, no solo
   para números. A tamaño pequeño (12–13px) las columnas se alinean solas.
4. **El texto explica la interfaz, no los iconos.** `▸ título`, `// comentario`,
   `$ prompt` — como comentarios y prompts de una terminal real. Los iconos
   que quedan son SVG con el color del acento, nunca emoji del sistema (se ven
   distinto en cada plataforma y no se pueden recolorear).
5. **Los bordes hacen el trabajo que antes hacía la sombra.** Nada de
   `box-shadow` decorativo ni superficies "flotantes"; un `border: 1px solid`
   con el color de acento basta para separar y para señalar estado.
6. **Todo lo animado respeta `prefers-reduced-motion`.** Sin excepciones —
   ver §7.

---

## 2. Tipografía

Una sola familia para toda la hoja: **JetBrains Mono**, autohospedada con
`next/font` (o el equivalente en tu stack) para que no dependa de una
petición externa ni dispare warnings de fuente manual.

```js
// layout raíz
import { JetBrains_Mono } from "next/font/google";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono-v6",
  display: "swap",
});

// <html className={jetbrainsMono.variable}>
```

```js
const V6_MONO = "var(--font-mono-v6), ui-monospace, SFMono-Regular, Menlo, monospace";
```

Si la app tiene zonas que **no** quieres tocar (una versión anterior, un
tema claro), define esto como variable de CSS aparte y aplícalo solo donde
haga falta — no reemplaces la tipografía global. Así es como convive en este
repo con el resto de la app, que sigue en la fuente del sistema.

**Escala de tamaño** (todo en `px`, sin `rem`, para que cuadre exacto con el
resto del código existente):

| Uso | Tamaño | Peso |
|---|---|---|
| Título de sección / fila de trade | 14px | 700 |
| Prompt de cabecera, título de popup | 13px | 400–700 |
| Texto de cuerpo, botones, inputs | 12px | 400–700 |
| Comentarios `//`, subtexto | 11px | 400 |
| Etiquetas en mayúsculas (`FECHA`, `TIPO`…) | 10px | 400, `letter-spacing: .3px`, `text-transform: uppercase` |
| Badges diminutos | 9px | 400 |

No hay escala intermedia: si algo no encaja en esta tabla, es que se ha
colado un tamaño del sistema de diseño anterior.

---

## 3. Color

```js
const V6 = {
  bg:     "#0A0A0A", // fondo de toda la hoja
  fg:     "#E8E8E8", // texto por defecto
  green:  "#4ECCA3", // positivo / guardar / éxito
  amber:  "#E2B144", // aviso / acento secundario
  orange: "#E0793C", // acento adicional (usado para distinguir una segunda entidad del mismo tipo)
  red:    "#E8536E", // negativo / borrar / error / umbral
  violet: "#A78BFA", // ajustes / estado "editando"
  blue:   "#5AA9E6", // información secundaria
  dim:    "#5C5C5C", // texto terciario, bordes tenues
  dim2:   "#8C8C8C", // texto secundario (entre fg y dim)
  white:  "#FFFFFF", // énfasis máximo (títulos, valores destacados)
  border: "#1E1E1E", // línea divisoria / borde por defecto
};
```

Fondo de superficies "hundidas" (inputs, celdas de dropdown, tarjetas de
detalle): `#101010`, un tono más claro que `bg`.

**Regla de oro: no inventes colores nuevos si ya existe uno parecido en tu
paleta actual.** Esta paleta se construyó reutilizando exactamente los hex
que la app ya usaba en su tema oscuro anterior — así el rediseño no cambia
el significado de "verde = bien, rojo = mal" que el usuario ya conocía, solo
la forma de las superficies. Si te hace falta un color nuevo (como `orange`
aquí, para poder distinguir una segunda entidad del mismo tipo — dos
proveedores, dos categorías…) añádelo una vez, documentado, no por color
puntual.

**Fondos tintados** (para franjas de aviso, filas positivas/negativas):
usa el color de acento en `rgba(r,g,b,0.05–0.16)` sobre el `bg` general, no
un `background` sólido nuevo. Ejemplos reales del código: fila de trade
ganador `rgba(78,204,163,0.07)`, aviso de error `rgba(232,83,110,0.1)`,
caja en modo edición `rgba(167,139,250,0.05)`.

---

## 4. Espaciado y radio

- `border-radius: 2px` en casi todo (inputs, botones, tarjetas, dropdowns).
  `1px` en barras finas (progreso, carga). Nunca más de `2px` salvo que
  quieras romper la regla a propósito.
- Bordes de `1px solid`, no `0.5px` (el `0.5px` es del sistema de diseño
  anterior, más "fino y flotante"; V6 es más rotundo).
- Indentado bajo un título de sección: `padding-left: 18px` (deja sitio al
  triángulo `▸` + un espacio).
- Separación entre secciones: `margin-top: 22px`.
- Gap horizontal entre elementos en línea (icono+texto, label+valor):
  `gap: 8px`. Entre botones de una fila: `gap: 8px`. Entre filas de una
  lista: `gap: 6–8px`.
- Padding de botón: `6–9px` vertical, `10–16px` horizontal según si lleva
  icono o solo texto.
- Padding de input: `5px 8px`.

---

## 5. Componentes

### 5.1 Cabecera de sección (`V6Sec`)

El patrón que sustituye a la "tarjeta con sombra" del diseño anterior: un
triángulo `▸` del color de acento de la hoja, el título, y una línea de
comentario opcional debajo, todo con el contenido indentado.

```jsx
function V6Sec({ accent, title, right, comment, children }) {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ color: accent }}>▸</span>
        <span style={{ color: V6.white, fontWeight: 700, fontSize: 14 }}>{title}</span>
        {right && <span style={{ marginLeft: "auto", fontSize: 11, color: V6.dim, whiteSpace: "nowrap" }}>{right}</span>}
      </div>
      {comment && <div style={{ fontSize: 11, color: V6.dim, paddingLeft: 18, marginTop: 2, marginBottom: 8 }}>{comment}</div>}
      <div style={{ paddingLeft: 18 }}>{children}</div>
    </div>
  );
}
```

Uso: `<V6Sec accent={V6.green} title="balance" comment={"// saldo actual y objetivo"}>…</V6Sec>`.
El `comment` siempre en minúscula y con el prefijo `//` como string explícito
(`{"// texto"}`), nunca como texto suelto — un JSX literal que empiece por
`//` lo interpreta el linter de React como un comentario roto.

### 5.2 Prompt de cabecera

La cabecera de la página imita un prompt de shell real: usuario, contexto,
`$`, y lo que "hay ahora mismo" en blanco y negrita.

```jsx
<span>
  <span style={{ color: V6.green }}>usuario</span><span style={{ color: V6.blue }}>@app</span>
  <span style={{ color: V6.dim }}>:~</span><span style={{ color: V6.green }}>$</span>{" "}
  <span style={{ color: V6.white, fontWeight: 700 }}>{seccionActual}</span>
</span>
```

### 5.3 Botones

Dos familias, no se mezclan:

- **Botones "de comando"** — texto entre corchetes, sin fondo ni borde,
  para acciones ligeras dentro del flujo de texto (nav inferior, acciones de
  fila, "editar"/"borrar"): `[texto]`, con el `texto` interior en el color
  de acento cuando está activo/disponible y en `V6.dim` cuando no.

  ```jsx
  <button style={{ fontFamily: V6_MONO, fontSize: 12, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
    [<span style={{ color: V6.green, fontWeight: 700 }}>+ trade</span>]
  </button>
  ```

- **Botones "de caja"** — para acciones primarias/secundarias con más peso
  (guardar, cancelar, borrar, crear cuenta): borde `1px solid` del color de
  acento, fondo transparente, texto del mismo color; el estado "cancelar" o
  "deshabilitado" usa `V6.border`/`V6.dim` en vez del color de acento.

  ```jsx
  <button style={{
    fontFamily: V6_MONO, fontSize: 12, fontWeight: 700, padding: "8px 10px",
    background: "none", border: `1px solid ${V6.green}`, borderRadius: 2, color: V6.green, cursor: "pointer",
  }}>guardar</button>
  ```

Nunca fondo sólido de color en un botón salvo casos muy puntuales (p. ej. un
estado "seleccionado" con `rgba(color, 0.12)` de fondo, nunca el color plano).

### 5.4 Campos de formulario

```jsx
const inputStyle = {
  fontFamily: V6_MONO, fontSize: 12, padding: "5px 8px", borderRadius: 2,
  border: `1px solid ${V6.border}`, background: "#101010", color: V6.fg,
  outline: "none", width: "100%", boxSizing: "border-box",
};
```

Etiqueta encima, en mayúsculas pequeñas (`fontSize: 10, textTransform:
"uppercase", letterSpacing: ".3px", color: V6.dim`). Estado de error: el
borde (y la etiqueta) pasan a `V6.red`, no se añade icono ni texto en rojo
aparte salvo un aviso general al final del formulario.

### 5.5 Desplegable propio (`V6Select`)

**El `<select>` nativo de HTML no se puede restylear cuando está abierto**
— ese popover lo pinta el sistema operativo, no el navegador. Para que un
desplegable tenga la estética cuadrada hay que construirlo a mano: un botón
que abre un panel absoluto con las opciones, mismo comportamiento de
selección que un `<select>`, cerrado al hacer click fuera.

```jsx
function V6Select({ value, onChange, options, disabled, placeholder, style, error }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const norm = options.map(o => (typeof o === "object" && o !== null ? o : { value: o, label: o }));
  const current = norm.find(o => String(o.value) === String(value));

  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        style={{
          fontFamily: V6_MONO, fontSize: 12, color: disabled ? V6.dim : V6.fg, background: "#101010",
          border: `1px solid ${open ? V6.green : error ? V6.red : V6.border}`, borderRadius: 2, padding: "5px 8px",
          outline: "none", width: "100%", boxSizing: "border-box", cursor: disabled ? "default" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, textAlign: "left",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {current ? current.label : (placeholder || "—")}
        </span>
        <span style={{ fontSize: 9, color: V6.dim, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 60,
          background: "#101010", border: `1px solid ${V6.border}`, borderRadius: 2,
          maxHeight: 240, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        }}>
          {norm.map((o, i) => {
            const sel = String(o.value) === String(value);
            return (
              <div
                key={`${o.value}-${i}`}
                onClick={() => { onChange(o.value); setOpen(false); }}
                style={{
                  fontFamily: V6_MONO, fontSize: 12, padding: "6px 8px", cursor: "pointer",
                  color: sel ? V6.green : V6.fg, background: sel ? "rgba(78,204,163,0.08)" : "transparent",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}
              >
                {sel ? "✓ " : "  "}{o.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

Aplica el mismo razonamiento a cualquier otro control nativo cuyo estado
abierto pinte el sistema operativo (`<input type="date">` en algunos
navegadores, menús contextuales…): o se acepta que ese trocito no sigue el
estilo, o se sustituye por uno propio.

### 5.6 Barras de progreso

Dos variantes, según si representan un valor real o solo "algo está
pasando":

**Barra de dato real** — carril punteado (una regla, no una pastilla lisa) y
relleno segmentado:

```js
const v6Track = {
  position: "relative", height: 8, borderRadius: 1, background: "#141414",
  backgroundImage: "repeating-linear-gradient(90deg, #262626 0 2px, transparent 2px 4px)",
};
const v6Fill = (pct, color) => ({
  position: "absolute", inset: 0, width: `${Math.max(0, Math.min(100, pct))}%`, borderRadius: 1,
  backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 14px, #0A0A0A 14px 16px)`,
});
```

**Barra de carga determinada** — arranca vacía y se rellena una sola vez en
un tiempo fijo; cuando termina, se queda llena hasta que el contenido real
esté listo. Nada de bucles ni de una imagen estática: el usuario necesita
ver que algo avanza de verdad.

```css
.v6-carga-barra {
  width: 0%;
  animation: v6CargaBarra 2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
@keyframes v6CargaBarra {
  from { width: 0%; }
  to   { width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .v6-carga-barra { animation: none; width: 100%; }
}
```

```jsx
// Estado en el componente raíz: no se enseña la app hasta que la barra
// termina Y los datos han llegado — lo que tarde más.
const [introDone, setIntroDone] = useState(false);
useEffect(() => {
  const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const t = setTimeout(() => setIntroDone(true), reducido ? 0 : 2000);
  return () => clearTimeout(t);
}, []);

{cargando || !introDone ? (
  <div style={{ background: V6.bg, /* pantalla completa, centrado */ }}>
    <div style={{ fontFamily: V6_MONO, maxWidth: 300, width: "100%" }}>
      <div style={{ fontSize: 13, marginBottom: 14 }}>
        <span style={{ color: V6.green }}>usuario@app</span><span style={{ color: V6.dim }}>:~</span>
        <span style={{ color: V6.green }}>$</span>{" "}
        <span style={{ color: V6.white }}>cargando</span>
        <span className="v6-cursor" style={{ background: V6.white }} />
      </div>
      <div style={{ position: "relative", height: 3, borderRadius: 1, overflow: "hidden", background: V6.border }}>
        <span className="v6-carga-barra" style={{ position: "absolute", inset: "0 auto 0 0", background: V6.green, borderRadius: 1 }} />
      </div>
      <div style={{ fontSize: 11, color: V6.dim, marginTop: 10 }}>{"// cargando…"}</div>
    </div>
  </div>
) : (
  <App />
)}
```

**Barra "algo está pasando" (indeterminada)** — para una operación en curso
sin progreso medible (guardando, subiendo un archivo): un segmento del 40%
que recorre el carril en bucle. Distinta de la de carga: esta sí es un
bucle infinito, porque no hay "cuándo termina" que animar hacia un final.

```css
.v6-barrido {
  position: absolute; top: 0; bottom: 0; width: 40%; border-radius: 1px;
  animation: v6Barrido 1.2s ease-in-out infinite;
}
@keyframes v6Barrido { 0% { left: -40%; } 100% { left: 100%; } }
@media (prefers-reduced-motion: reduce) {
  .v6-barrido { animation: none; left: 0; width: 100%; opacity: 0.65; }
}
```

### 5.7 Popups / modales

Fondo oscurecido con blur, centrado, y la tarjeta con el mismo tratamiento
cuadrado que el resto de la hoja — nada de `border-radius: 12–16px` como en
un modal "de sistema operativo" clásico.

```jsx
const veloPopup = {
  position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)",
  backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
};

<div style={veloPopup}>
  <div style={{
    background: V6.bg, border: `1px solid ${V6.border}`, borderRadius: 2, padding: 16,
    width: "100%", maxWidth: 460, maxHeight: "90dvh", overflowY: "auto", fontFamily: V6_MONO,
    boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
  }}>
    {/* $ título del popup, // subtítulo, campos, botones de caja */}
  </div>
</div>
```

Para un popup destructivo (confirmar borrado), el borde de la tarjeta pasa
a `V6.red` en vez de `V6.border` — es la única señal extra que hace falta,
sin iconos de alerta llamativos.

### 5.8 Menú inferior fijo

El prompt hace de menú: dice dónde estás (con el cursor parpadeando), y
debajo los destinos entre corchetes, cada uno con su color de acento. La
celda de toque es el ancho completo dividido entre destinos × **44px de
alto** — el mínimo razonable para el dedo, no el texto del corchete.

```jsx
<div style={{
  position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 900,
  background: V6.bg, borderTop: `1px solid ${V6.border}`,
  padding: "8px 14px calc(8px + env(safe-area-inset-bottom, 0px))", fontFamily: V6_MONO,
}}>
  <div style={{ fontSize: 12, color: V6.dim2 }}>
    <span style={{ color: V6.green }}>$</span> <span style={{ color: V6.dim }}>cd</span>{" "}
    <span style={{ color: acentoActivo, fontWeight: 700 }}>{seccionActual}</span>
    <span className="v6-cursor" style={{ background: acentoActivo }} />
  </div>
  <div style={{ display: "flex", alignItems: "stretch", height: 44, marginTop: 2 }}>
    {destinos.map(d => (
      <button key={d.id} style={{ flex: 1, /* … */ }}>[{d.label}]</button>
    ))}
  </div>
</div>
```

### 5.9 Listas tipo "diff"

Para listas de eventos con signo (ganancia/pérdida, entrada/salida, +/-):
una fila con borde izquierdo de 2px del color de resultado, fondo muy
tenue del mismo color, y el signo (+/−/·) como primer elemento. Es
literalmente un `diff` de terminal, se escanea sin leer un solo número.

```jsx
<button style={{
  textAlign: "left", background: positivo ? "rgba(78,204,163,0.07)" : "rgba(232,83,110,0.07)",
  border: "none", borderLeft: `2px solid ${positivo ? V6.green : V6.red}`,
  padding: "5px 8px", width: "100%",
}}>
  <span style={{ color: positivo ? V6.green : V6.red, fontWeight: 700 }}>{positivo ? "+" : "−"}</span>
  {/* resto de la fila */}
</button>
```

### 5.10 Tarjetas con acento lateral por categoría

Cuando una lista agrupa entidades de distinto tipo (cuentas de distintos
proveedores, tareas de distintos proyectos…), usa un `borderLeft: 2px solid`
con un color por categoría en vez de un icono o una etiqueta de texto — más
compacto y se escanea igual de rápido:

```js
const colorPorCategoria = (categoria) => {
  const c = (categoria || "").toLowerCase();
  if (c.includes("a")) return V6.amber;
  if (c.includes("b")) return V6.orange;
  return V6.violet; // categoría desconocida / por defecto
};
```

---

## 6. Iconos

SVG inline, con `size`/`color` como props, nunca emoji del sistema (Android
e iOS los pintan distinto y no se pueden recolorear):

```jsx
const IconEjemplo = ({ s = 16, c }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
    <path d="…" fill={c} />
  </svg>
);
```

---

## 7. Movimiento y accesibilidad

- **Cursor de terminal parpadeando** — `steps(1)` en vez de una curva suave,
  para que parpadee "digital", no que haga fundido:

  ```css
  .v6-cursor {
    display: inline-block; width: 7px; height: 12px; margin-left: 1px; vertical-align: -2px;
    animation: v6Parpadeo 1.1s steps(1) infinite;
  }
  @keyframes v6Parpadeo { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .v6-cursor { animation: none; opacity: 1; } }
  ```

- **Toda animación en bucle o con temporización propia lleva su bloque
  `@media (prefers-reduced-motion: reduce)`** que la para en un estado
  legible (llena, visible, quieta) — nunca la deja a medias ni la oculta.
- **Si una animación controla cuándo pasa algo en JS** (como la pantalla de
  carga con `introDone`), la comprobación de `prefers-reduced-motion` va
  también en el JS, no solo en el CSS — si no, el temporizador se queda
  esperando un evento de animación que nunca llega.
- Nada de `autoplay` de vídeo/audio, y ningún parpadeo por debajo de 1s de
  periodo salvo el cursor (que es opacidad, no color, y para con movimiento
  reducido).

---

## 8. Checklist para aplicar esto a otra app

1. **Instala la tipografía** con `next/font` (o el loader de tu framework) y
   expórtala como variable de CSS, sin tocar el resto del CSS global.
2. **Define la paleta** (§3) reutilizando los colores que tu app ya usa
   para "positivo/negativo/aviso", no colores nuevos.
3. **Decide el alcance**: ¿esta estética sustituye TODA la app, o convive
   con la anterior como una vista alternativa? Si convive, cada componente
   compartido (formularios, confirmaciones, selects) necesita su propia
   versión con este estilo — no restyles el componente compartido in situ,
   porque cambiarías también la vista antigua. Crea `NuevoComponente` al
   lado del original, con la misma lógica y las props que haga falta.
4. **Construye los primitivos primero**: `Sec` (cabecera de sección),
   `Select` (desplegable propio), el input cuadrado, los dos tipos de
   botón. Todo lo demás se monta sobre estos cuatro.
5. **Pantalla de carga real** antes que nada visible: barra que se rellena
   una vez, gate en JS con `prefers-reduced-motion`.
6. **Pasa un lint/build** después de cada bloque de cambios — este estilo
   toca muchísimas líneas de estilo inline; es fácil dejar una coma o un
   paréntesis suelto en un fichero grande.

---

## 9. Qué NO hacer

- No mezcles `border-radius` grandes (8–16px) con este sistema "a medias":
  o la pantalla es V6 entera, o no lo es. Un botón cuadrado al lado de una
  tarjeta redondeada rompe la sensación de terminal.
- No uses emoji como icono aunque sea "solo para probar rápido" — se queda.
- No animes con `infinite` algo que representa progreso real (carga de
  datos, subida de archivo): usa el patrón determinado de §5.6 con
  temporización fija, o el usuario no puede distinguir "cargando" de
  "colgado".
- No definas el color de una fila/estado con un nombre de color CSS
  (`"orange"`, `"green"`) — usa siempre el token de la paleta (`V6.orange`,
  `V6.green`) para que un cambio de paleta futuro lo actualice todo a la vez.
