#!/usr/bin/env node
/**
 * Pruebas del generador de solicitudes RGPD.
 *
 * Aquí lo que se comprueba es sobre todo legal, no técnico: que se cite el
 * artículo correcto, que el plazo del artículo 12.3 se calcule bien, y —lo más
 * importante— que el DNI no se cuele en un texto cuando no se ha pasado.
 */

import {
  redactarCarta,
  asuntoCarta,
  redactarReclamacionAepd,
  correosProbables,
  enlaceMailto,
  fechaLimite,
  diasRestantes,
  HUECO_DNI,
  BASES,
} from '../src/lib/cartas.js';

let pasadas = 0;
const fallos = [];

function ok(nombre, condicion, detalle = '') {
  if (condicion) pasadas++;
  else fallos.push(`${nombre} ${detalle}`);
}

const base = {
  servicio: 'Ejemplo S.L.',
  nombre: 'Ana López',
  email: 'ana@ejemplo.com',
  identificadores: ['ana@ejemplo.com', 'analopez'],
};

// --- Se cita el artículo correcto en cada caso -------------------------
for (const [id, meta] of Object.entries(BASES)) {
  const carta = redactarCarta({ ...base, base: id });
  const numero = meta.articulo.match(/\d+/)[0];

  // Se busca "artículo N del" y no la cadena entera de BASES, porque el texto
  // legal escribe el nombre completo del reglamento y el salto de línea cae en
  // medio. Lo que de verdad hay que blindar es que cada carta invoque SU
  // artículo: un copia y pega que dejara el 17 en la de oposición produciría
  // una solicitud legalmente equivocada con muy buena pinta.
  ok(
    `${id} invoca el artículo ${numero}`,
    carta.includes(`artículo ${numero} del`),
    `no aparece "artículo ${numero} del"`
  );

  const otros = Object.values(BASES)
    .map((b) => b.articulo.match(/\d+/)[0])
    .filter((n) => n !== numero);
  for (const n of otros) {
    // El 15 aparece legítimamente en la carta de supresión (LOPDGDD art. 15),
    // así que se comprueba la fórmula concreta "artículo N del RGPD".
    ok(
      `${id} no invoca el artículo ${n} del RGPD`,
      !carta.includes(`artículo ${n} del Reglamento`),
      'cita el artículo de otro derecho'
    );
  }
  ok(`${id} nombra al servicio`, carta.includes('Ejemplo S.L.'));
  ok(`${id} incluye los identificadores`, carta.includes('analopez'));
  ok(`${id} invoca el plazo de un mes`, carta.includes('artículo 12.3'));
  ok(`${id} menciona la AEPD`, carta.includes('Agencia Española de Protección de Datos'));
}

// --- El DNI: la regla que más importa ----------------------------------
const sinDni = redactarCarta({ ...base });
ok('sin DNI queda el hueco para rellenar', sinDni.includes(HUECO_DNI));
ok(
  'sin DNI no se inventa ningún número',
  !/DNI\/NIE:\s*\d/.test(sinDni),
  'apareció algo que parece un DNI real'
);

const conDni = redactarCarta({ ...base, dni: '12345678Z' });
ok('con DNI se usa el proporcionado', conDni.includes('12345678Z'));
ok('con DNI ya no queda el hueco', !conDni.includes(HUECO_DNI));

// --- Supresión: los cuatro puntos que la hacen efectiva ----------------
const sup = redactarCarta({ ...base, base: 'ART17' });
ok('supresión pide borrar copias de seguridad', sup.includes('copias'));
ok('supresión invoca el artículo 19 (comunicar a terceros)', sup.includes('artículo 19'));
ok('supresión pide cerrar la cuenta', sup.toLowerCase().includes('cuenta'));
ok('supresión pide confirmación por escrito', sup.includes('confirmación por escrito'));

// El art. 21.3 no admite ponderación en marketing directo: es el punto fuerte
// de esa carta y no debe perderse en una reescritura.
const opo = redactarCarta({ ...base, base: 'ART21' });
ok('oposición invoca el artículo 21.3', opo.includes('21.3'));
ok('oposición menciona mercadotecnia directa', opo.includes('mercadotecnia directa'));

// --- Acceso ------------------------------------------------------------
const acc = redactarCarta({ ...base, base: 'ART15' });
ok('acceso pide el origen de los datos', acc.includes('origen'));
ok('acceso pide los destinatarios', acc.includes('destinatarios'));
ok('acceso pregunta por decisiones automatizadas', acc.includes('automatizadas'));

// --- Asunto ------------------------------------------------------------
ok(
  'el asunto nombra el derecho y el servicio',
  asuntoCarta({ base: 'ART17', servicio: 'Ejemplo S.L.' }).includes('supresión') &&
    asuntoCarta({ base: 'ART17', servicio: 'Ejemplo S.L.' }).includes('Ejemplo S.L.')
);

// --- Plazo del artículo 12.3 -------------------------------------------
const enviada = new Date('2026-01-10T12:00:00Z');
const limite = fechaLimite(enviada);
ok(
  'el plazo son 30 días desde el envío',
  limite.toISOString().startsWith('2026-02-09'),
  `dio ${limite.toISOString()}`
);
ok(
  'quedan días si aún no ha vencido',
  diasRestantes(limite, new Date('2026-02-01T12:00:00Z')) === 8
);
ok(
  'los días son negativos si ya venció',
  diasRestantes(limite, new Date('2026-02-20T12:00:00Z')) < 0
);

// --- Reclamación AEPD ---------------------------------------------------
const recl = redactarReclamacionAepd({ ...base, enviadaEn: enviada, base: 'ART17' });
ok('la reclamación cita el artículo 12.3', recl.includes('12.3'));
ok('la reclamación indica la fecha de la solicitud original', recl.includes('enero'));
ok('la reclamación nombra a la entidad', recl.includes('Ejemplo S.L.'));
ok('la reclamación sin DNI deja el hueco', recl.includes(HUECO_DNI));

// --- Correos probables --------------------------------------------------
const correos = correosProbables('ejemplo.com');
ok('propone privacy@ primero', correos[0] === 'privacy@ejemplo.com');
ok('propone también dpo@', correos.includes('dpo@ejemplo.com'));
ok('sin dominio no propone nada', correosProbables(null).length === 0);

// --- mailto -------------------------------------------------------------
const enlace = enlaceMailto({
  para: 'privacy@ejemplo.com',
  asunto: 'Asunto con acentos: supresión',
  cuerpo: 'Línea uno\nLínea dos & más',
});
ok('el mailto apunta al destinatario', enlace.startsWith('mailto:privacy@ejemplo.com?'));
ok('el mailto codifica los saltos de línea', enlace.includes('%0A'));
ok('el mailto codifica el ampersand del cuerpo', enlace.includes('%26'));
// Los '+' de URLSearchParams los muestran algunos clientes como signos más
// literales en vez de espacios; por eso se reemplazan por %20.
ok('el mailto no deja "+" como espacio', !enlace.includes('+'));

// --- Resultado -----------------------------------------------------------
console.log(`\nComprobaciones de cartas pasadas: ${pasadas}`);
if (fallos.length) {
  console.log(`Fallos: ${fallos.length}\n`);
  for (const f of fallos) console.log('  ✗', f);
  process.exit(1);
}
console.log('Fallos: 0\n');
