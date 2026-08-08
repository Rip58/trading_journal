#!/usr/bin/env node
/**
 * Mide la precisión real del detector.
 *
 *   node scripts/medir-precision.mjs [--n 60] [--gratis] [--todos]
 *
 * WhatsMyName trae en cada entrada un campo `known` con usuarios reales
 * verificados. Eso es un banco de pruebas gratis: por cada sitio se comprueba
 * un alias que SÍ existe (debe dar ENCONTRADO) y uno inventado que no puede
 * existir (debe dar NO_ENCONTRADO). Todo lo demás es error, y la tasa de
 * NO_CONCLUYENTE es la medida directa de cuánto nos penaliza escanear desde una
 * IP de datacenter en vez de una residencial.
 *
 * Se ejecuta antes de construir nada encima del escáner. Si estos números son
 * malos, el producto no se sostiene y hay que saberlo ahora.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  comprobarSitio,
  conConcurrencia,
  aliasEsValido,
  ENCONTRADO,
  NO_ENCONTRADO,
  NO_CONCLUYENTE,
} from '../src/lib/deteccion.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const leerOpcion = (nombre, pordefecto) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : pordefecto;
};
const N = Number(leerOpcion('n', 60));
const SOLO_GRATIS = args.includes('--gratis');
const TODOS = args.includes('--todos');
const CONCURRENCIA = Number(leerOpcion('c', 10));

/** Alias que no puede existir en ningún sitio. */
const ALIAS_FANTASMA = `zz${Math.random().toString(36).slice(2, 10)}qx7`;

function barra(valor, total, ancho = 28) {
  const n = total ? Math.round((valor / total) * ancho) : 0;
  return '█'.repeat(n) + '·'.repeat(ancho - n);
}

function pct(valor, total) {
  return total ? `${((valor / total) * 100).toFixed(1)}%` : '—';
}

async function main() {
  const sitios = JSON.parse(
    await readFile(join(RAIZ, 'data', 'sitios.json'), 'utf8')
  );

  let candidatos = sitios.filter(
    (s) => !s.sensible && s.conocidos.some((k) => aliasEsValido(k))
  );
  if (SOLO_GRATIS) candidatos = candidatos.filter((s) => s.gratis);
  if (!TODOS) candidatos = candidatos.slice(0, N);

  console.log(`Midiendo ${candidatos.length} sitios`);
  console.log(`  concurrencia ${CONCURRENCIA}, alias fantasma "${ALIAS_FANTASMA}"`);
  console.log(`  ${candidatos.length * 2} peticiones en total\n`);

  const inicio = Date.now();
  let hechos = 0;

  const filas = await conConcurrencia(candidatos, CONCURRENCIA, async (s) => {
    const conocido = s.conocidos.find((k) => aliasEsValido(k));
    const [positivo, negativo] = await Promise.all([
      comprobarSitio(s, conocido),
      comprobarSitio(s, ALIAS_FANTASMA),
    ]);
    hechos++;
    if (hechos % 25 === 0) {
      process.stdout.write(`  ...${hechos}/${candidatos.length}\r`);
    }
    return { sitio: s, conocido, positivo, negativo };
  });

  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);

  // --- Recuento ---------------------------------------------------------
  const r = {
    aciertoPositivo: 0, // existe y lo detecta
    falsoNegativo: 0, // existe y dice que no
    inconcluyentePositivo: 0,
    aciertoNegativo: 0, // no existe y lo dice
    falsoPositivo: 0, // no existe y dice que sí  <- el error más grave
    inconcluyenteNegativo: 0,
  };
  const motivos = {};
  const fallos = [];

  for (const f of filas) {
    if (f.positivo.confianza === ENCONTRADO) r.aciertoPositivo++;
    else if (f.positivo.confianza === NO_ENCONTRADO) {
      r.falsoNegativo++;
      fallos.push({ tipo: 'falso negativo', ...f });
    } else {
      r.inconcluyentePositivo++;
      motivos[f.positivo.motivo || `http ${f.positivo.estado}`] =
        (motivos[f.positivo.motivo || `http ${f.positivo.estado}`] || 0) + 1;
    }

    if (f.negativo.confianza === NO_ENCONTRADO) r.aciertoNegativo++;
    else if (f.negativo.confianza === ENCONTRADO) {
      r.falsoPositivo++;
      fallos.push({ tipo: 'FALSO POSITIVO', ...f });
    } else {
      r.inconcluyenteNegativo++;
    }
  }

  const n = filas.length;
  const totalInconcluyente = r.inconcluyentePositivo + r.inconcluyenteNegativo;

  console.log(`\nCompletado en ${segundos}s\n`);
  console.log('Alias que SÍ existe:');
  console.log(`  detectado        ${barra(r.aciertoPositivo, n)} ${String(r.aciertoPositivo).padStart(3)}  ${pct(r.aciertoPositivo, n)}`);
  console.log(`  falso negativo   ${barra(r.falsoNegativo, n)} ${String(r.falsoNegativo).padStart(3)}  ${pct(r.falsoNegativo, n)}`);
  console.log(`  no concluyente   ${barra(r.inconcluyentePositivo, n)} ${String(r.inconcluyentePositivo).padStart(3)}  ${pct(r.inconcluyentePositivo, n)}`);
  console.log('\nAlias que NO existe:');
  console.log(`  descartado       ${barra(r.aciertoNegativo, n)} ${String(r.aciertoNegativo).padStart(3)}  ${pct(r.aciertoNegativo, n)}`);
  console.log(`  FALSO POSITIVO   ${barra(r.falsoPositivo, n)} ${String(r.falsoPositivo).padStart(3)}  ${pct(r.falsoPositivo, n)}`);
  console.log(`  no concluyente   ${barra(r.inconcluyenteNegativo, n)} ${String(r.inconcluyenteNegativo).padStart(3)}  ${pct(r.inconcluyenteNegativo, n)}`);

  console.log(`\nTasa global de no concluyente: ${pct(totalInconcluyente, n * 2)}`);
  console.log('  (es la penalización por escanear desde IP de datacenter)');

  if (Object.keys(motivos).length) {
    console.log('\nPor qué no fue concluyente:');
    for (const [m, c] of Object.entries(motivos).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(c).padStart(3)}  ${m}`);
    }
  }

  if (fallos.length) {
    console.log(`\nSitios con veredicto incorrecto (${fallos.length}):`);
    for (const f of fallos.slice(0, 25)) {
      console.log(`  ${f.tipo.padEnd(15)} ${f.sitio.nombre}  (alias "${f.conocido}")`);
    }
    if (fallos.length > 25) console.log(`  ...y ${fallos.length - 25} más`);
  }

  // El falso positivo es el error caro: le dices a alguien que tiene una cuenta
  // que no existe, y encima le vendes una carta para borrarla.
  console.log(
    `\nVeredicto: ${
      r.falsoPositivo === 0
        ? 'sin falsos positivos'
        : `${r.falsoPositivo} FALSOS POSITIVOS — revisar antes de seguir`
    }`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
