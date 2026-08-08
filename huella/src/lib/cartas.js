/**
 * Generador de solicitudes RGPD en español.
 *
 * Puro y sin dependencias: mismas funciones en servidor y en cliente. Importa
 * que sea así porque el DNI se rellena en el navegador, en el momento de
 * enviar, y no debe pasar nunca por el servidor ni por la base de datos.
 *
 * Los textos siguen la estructura de los modelos de la AEPD:
 * https://www.aepd.es/derechos-y-deberes/modelos-y-formularios
 */

/** Marcador que rellena la persona antes de enviar. Nunca se almacena. */
export const HUECO_DNI = '[TU DNI/NIE]';

export const BASES = {
  ART15: {
    id: 'ART15',
    nombre: 'Derecho de acceso',
    articulo: 'artículo 15 del RGPD',
    resumen: 'Pide qué datos tuyos tienen y de dónde los sacaron.',
  },
  ART17: {
    id: 'ART17',
    nombre: 'Derecho de supresión',
    articulo: 'artículo 17 del RGPD',
    resumen: 'Exige que borren tus datos. El llamado derecho al olvido.',
  },
  ART21: {
    id: 'ART21',
    nombre: 'Derecho de oposición',
    articulo: 'artículo 21 del RGPD',
    resumen: 'Exige que dejen de tratar tus datos con fines de marketing o perfilado.',
  },
};

/** Plazo del artículo 12.3 RGPD: un mes desde la solicitud. */
export const DIAS_DE_PLAZO = 30;

export function fechaLimite(enviadaEn) {
  const d = new Date(enviadaEn);
  d.setDate(d.getDate() + DIAS_DE_PLAZO);
  return d;
}

export function diasRestantes(venceEn, ahora = new Date()) {
  return Math.ceil((new Date(venceEn) - ahora) / 86400000);
}

function fechaLarga(d = new Date()) {
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

function bloqueIdentificacion({ nombre, email, dni }) {
  const lineas = [];
  if (nombre) lineas.push(`Nombre y apellidos: ${nombre}`);
  lineas.push(`DNI/NIE: ${dni || HUECO_DNI}`);
  if (email) lineas.push(`Correo electrónico: ${email}`);
  return lineas.join('\n');
}

const CUERPOS = {
  ART17: ({ servicio, identificadores }) => `
Solicito el ejercicio del derecho de supresión reconocido en el artículo 17 del
Reglamento (UE) 2016/679 (RGPD) y en el artículo 15 de la Ley Orgánica 3/2018
(LOPDGDD), respecto de todos los datos personales que ${servicio} trate sobre mí.

Los datos con los que puedo estar identificado en sus sistemas son:
${identificadores}

En concreto, solicito:

1. La supresión de todos mis datos personales de sus sistemas, incluidas copias
   de seguridad y cualquier registro derivado, salvo aquellos que deban
   conservarse por obligación legal, indicándome en tal caso cuál es la norma
   que lo exige y el plazo de conservación previsto.
2. La eliminación o cierre definitivo de cualquier cuenta asociada.
3. La comunicación de esta solicitud a los terceros a quienes hayan cedido o
   comunicado mis datos, conforme al artículo 19 del RGPD.
4. La confirmación por escrito de que se ha llevado a cabo la supresión.`,

  ART15: ({ servicio, identificadores }) => `
Solicito el ejercicio del derecho de acceso reconocido en el artículo 15 del
Reglamento (UE) 2016/679 (RGPD), respecto de los datos personales que
${servicio} trate sobre mí.

Los datos con los que puedo estar identificado en sus sistemas son:
${identificadores}

En concreto, solicito que me faciliten:

1. Copia de todos los datos personales míos que estén siendo tratados.
2. Los fines del tratamiento y la base jurídica que lo legitima.
3. El origen de los datos, cuando no hayan sido obtenidos directamente de mí.
4. Los destinatarios o categorías de destinatarios a quienes se hayan
   comunicado o se prevea comunicar mis datos.
5. El plazo previsto de conservación o los criterios para determinarlo.
6. La existencia de decisiones automatizadas o elaboración de perfiles y, en su
   caso, la lógica aplicada.`,

  ART21: ({ servicio, identificadores }) => `
Solicito el ejercicio del derecho de oposición reconocido en el artículo 21 del
Reglamento (UE) 2016/679 (RGPD), respecto del tratamiento que ${servicio}
realiza de mis datos personales.

Los datos con los que puedo estar identificado en sus sistemas son:
${identificadores}

En concreto, me opongo a:

1. El tratamiento de mis datos con fines de mercadotecnia directa, incluida la
   elaboración de perfiles vinculada a dicha mercadotecnia. Conforme al artículo
   21.3 del RGPD, esta oposición no admite excepción ni ponderación de intereses.
2. La cesión o comunicación de mis datos a terceros con esa finalidad.`,
};

const CIERRE = `
Les recuerdo que, conforme al artículo 12.3 del RGPD, disponen de un plazo de un
mes desde la recepción de esta solicitud para responder. Transcurrido dicho plazo
sin respuesta satisfactoria, presentaré la correspondiente reclamación ante la
Agencia Española de Protección de Datos.

Quedo a la espera de su respuesta.`;

/**
 * Redacta la solicitud completa.
 * `dni` es opcional a propósito: si no se pasa, queda el hueco para rellenar a
 * mano, que es el comportamiento por defecto y el que evita almacenarlo.
 */
export function redactarCarta({
  base = 'ART17',
  servicio,
  nombre,
  email,
  dni,
  identificadores = [],
  fecha = new Date(),
}) {
  const cuerpo = CUERPOS[base] ?? CUERPOS.ART17;
  const lista = identificadores.length
    ? identificadores.map((i) => `  - ${i}`).join('\n')
    : `  - ${email ?? '(indica aquí tu correo o usuario)'}`;

  return [
    `A la atención del Delegado de Protección de Datos de ${servicio}`,
    '',
    `Fecha: ${fechaLarga(fecha)}`,
    '',
    'DATOS DEL SOLICITANTE',
    bloqueIdentificacion({ nombre, email, dni }),
    '',
    'SOLICITUD',
    cuerpo({ servicio, identificadores: lista }).trim(),
    '',
    CIERRE.trim(),
    '',
    'Atentamente,',
    nombre || HUECO_DNI.replace('DNI/NIE', 'NOMBRE'),
    '',
    '---',
    'Adjunto copia de mi documento de identidad a efectos de acreditar mi identidad.',
  ].join('\n');
}

export function asuntoCarta({ base = 'ART17', servicio }) {
  const b = BASES[base] ?? BASES.ART17;
  return `Ejercicio del ${b.nombre.toLowerCase()} (${b.articulo}) — ${servicio}`;
}

/**
 * Reclamación ante la AEPD, para cuando el mes vence sin respuesta. Es la
 * consecuencia real del plazo, y sin ella el seguimiento no sirve de nada.
 */
export function redactarReclamacionAepd({
  servicio,
  nombre,
  email,
  dni,
  enviadaEn,
  base = 'ART17',
}) {
  const b = BASES[base] ?? BASES.ART17;
  return [
    'RECLAMACIÓN ANTE LA AGENCIA ESPAÑOLA DE PROTECCIÓN DE DATOS',
    '',
    `Fecha: ${fechaLarga()}`,
    '',
    'DATOS DEL RECLAMANTE',
    bloqueIdentificacion({ nombre, email, dni }),
    '',
    'ENTIDAD RECLAMADA',
    servicio,
    '',
    'HECHOS',
    `1. Con fecha ${fechaLarga(new Date(enviadaEn))} ejercí ante ${servicio} mi`,
    `   ${b.nombre.toLowerCase()}, al amparo del ${b.articulo}.`,
    '2. Ha transcurrido el plazo de un mes que establece el artículo 12.3 del',
    '   RGPD sin que haya recibido respuesta.',
    '',
    'SOLICITO',
    'Que se tenga por presentada esta reclamación y, previos los trámites',
    'oportunos, se requiera a la entidad reclamada el cumplimiento de mi derecho.',
    '',
    'Se adjunta copia de la solicitud original y acreditación de su envío.',
    '',
    '---',
    'Presentar en: https://www.aepd.es/derechos-y-deberes/modelos-y-formularios',
  ].join('\n');
}

/**
 * Dirección probable del responsable de privacidad cuando el catálogo no trae
 * una. No es adivinación: privacy@ y dpo@ son las convenciones que el propio
 * RGPD empujó, y son las que más responden.
 */
export function correosProbables(dominio) {
  if (!dominio) return [];
  return [`privacy@${dominio}`, `dpo@${dominio}`, `legal@${dominio}`];
}

export function enlaceMailto({ para, asunto, cuerpo }) {
  const q = new URLSearchParams({ subject: asunto, body: cuerpo });
  return `mailto:${para ?? ''}?${q.toString().replace(/\+/g, '%20')}`;
}
