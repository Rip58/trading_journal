#!/usr/bin/env node
/**
 * Envuelve docs/terminal-confluencia.part.html en una página HTML completa y la
 * deja en public/terminal-confluencia.html, servida por Next en
 * http://localhost:3000/terminal-confluencia.html
 *
 * El fragmento es la única fuente: es lo que se publica como artefacto (donde el
 * <head> lo pone el host) y lo que se envuelve aquí para el uso local.
 *
 *   node scripts/build-terminal-confluencia.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origen = join(raiz, "docs", "terminal-confluencia.part.html");
const destino = join(raiz, "public", "terminal-confluencia.html");

const fragmento = await readFile(origen, "utf8");

// Mismo reset que aplica el host de artefactos, para que las dos versiones se
// vean igual: color-scheme, cuerpo sin margen e imágenes contenidas.
const pagina = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root{color-scheme:dark}
  body{margin:0}
  img{max-width:100%}
  [hidden]{display:none!important}
</style>
</head>
<body>
${fragmento}</body>
</html>
`;

await writeFile(destino, pagina, "utf8");
console.log(`terminal-confluencia: ${fragmento.length} B -> public/terminal-confluencia.html`);
