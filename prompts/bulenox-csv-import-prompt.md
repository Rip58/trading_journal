# Prompt IA — Importar reporte de cuentas Bulenox como trades diarios

Pega el prompt siguiente en tu IA (ChatGPT / Claude / Gemini) y adjunta el
contenido del CSV `bulenox_cuentas_reporte.csv`. La IA devolverá un **CSV limpio**
listo para el botón **"Importar CSV"** de la app.

---

## PROMPT

Eres un asistente que normaliza reportes de cuentas de trading para importarlos en un diario.

Voy a darte el contenido de un reporte de la propfirm **Bulenox** en formato CSV.
El archivo tiene DOS secciones separadas por líneas de encabezado:

1. `=== RESUMEN DE CUENTAS ===` → metadatos de cada cuenta (objetivo, drawdown, plan, etc.).
   **IGNORA esta sección por completo.** No genera operaciones.
2. `=== DATOS DIARIOS ===` → una fila por **día operado** de cada cuenta, con columnas:
   `Account, Date, AccountBalance, AutoLiquidateThreshold, TotalCommission, PnL`.
   Esta es la única sección que debes usar.

### Reglas de conversión (sección DATOS DIARIOS)

Cada fila representa el **resultado NETO de un día completo** (no una operación individual).
Genera **una fila de salida por cada fila de entrada** que cumpla TODAS estas condiciones:

- La columna `Date` tiene una fecha válida (formato YYYY-MM-DD).
- La columna `PnL` es un número (positivo o negativo).
- **DESCARTA** filas donde `PnL` sea exactamente `0` (días sin operar).
- **DESCARTA** filas con texto tipo `"Sin datos disponibles"` o `"Sin datos (cuenta nueva)"`.

### Mapeo de columnas (entrada → salida)

| Columna de salida | Cómo calcularla |
|-------------------|-----------------|
| `date`        | valor de `Date`, en formato `YYYY-MM-DD` |
| `account`     | valor de `Account` + el sufijo `!Bulenox!Bulenox` (ej: `BX-M101840062061` → `BX-M101840062061!Bulenox!Bulenox`) |
| `pnl`         | valor de `PnL` (número, sin símbolos; los negativos entre paréntesis como `(173.50)` conviértelos a `-173.50`) |
| `commission`  | valor de `TotalCommission` en **negativo** (ej: `13` → `-13`) |
| `gross`       | `pnl` menos `commission` = `PnL + TotalCommission` (ej: PnL 417, comisión 13 → gross 430) |
| `result`      | `Win` si `pnl > 0`, `Loss` si `pnl < 0` |
| `instrument`  | siempre `NQ` |
| `qty`         | siempre `1` |
| `strategy`    | siempre `Resumen diario` |
| `timeframe`   | siempre `Diario` |
| `notes`       | `Balance cierre: $<AccountBalance> | Umbral autoliq.: $<AutoLiquidateThreshold>` |
| `direction`   | déjalo **vacío** (un día agrega long y short; no se puede saber) |
| `entry_time`  | vacío |
| `exit_time`   | vacío |
| `entry`       | vacío |
| `exit_price`  | vacío |
| `mae`         | vacío |
| `mfe`         | vacío |
| `etd`         | vacío |
| `rr`          | vacío |

### Formato de salida (OBLIGATORIO)

Devuelve **EXCLUSIVAMENTE** un CSV plano (sin ```` ```csv ````, sin explicaciones),
con EXACTAMENTE esta fila de encabezado y en este orden:

```
date,account,instrument,direction,qty,entry,exit_price,gross,commission,pnl,mae,mfe,etd,rr,result,strategy,timeframe,notes,entry_time,exit_time
```

- Usa la coma `,` como separador.
- Si un campo va vacío, déjalo vacío (dos comas seguidas), no pongas `null`.
- Encierra entre comillas dobles cualquier campo (como `notes`) que contenga comas.
- Ordena las filas por `account` y luego por `date` ascendente.
- No inventes datos: los campos marcados como "vacío" van vacíos.

---

## Nota sobre nombres de cuenta

La app ya tiene (o tendrá) las cuentas con nombres tipo `BX-M101840062061!Bulenox!Bulenox`.
Si en la app usas otro nombre, ajústalo en la columna `account` del CSV generado
o deja que el asistente de importación de la app te pida vincular la cuenta.
