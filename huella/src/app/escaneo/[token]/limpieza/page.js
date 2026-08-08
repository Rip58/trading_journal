import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { bajaPorIndice } from '@/lib/catalogo';
import TableroBajas from './TableroBajas';

export const dynamic = 'force-dynamic';

/** Ordena por impacto: primero lo grave, y a igual gravedad lo más fácil de resolver. */
const PESO_SEVERIDAD = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3 };
const PESO_DIFICULTAD = { easy: 0, medium: 1, limited: 2, hard: 3, impossible: 4 };

export default async function Limpieza({ params }) {
  const { token } = await params;

  const escaneo = await db.escaneo.findUnique({
    where: { token },
    include: {
      sujeto: true,
      hallazgos: {
        where: { confianza: 'ENCONTRADO' },
        include: { solicitudes: true },
      },
    },
  });
  if (!escaneo) notFound();

  // El catálogo de bajas son 736 KB: se resuelve en el servidor y al navegador
  // solo viaja lo que se pinta.
  const filas = await Promise.all(
    escaneo.hallazgos.map(async (h) => {
      const baja = await bajaPorIndice(h.datos?.indiceBaja);
      const solicitud = h.solicitudes[0] ?? null;
      return {
        id: h.id,
        nombre: h.nombre,
        dominio: h.dominio,
        severidad: h.severidad,
        url: h.url,
        baja: baja
          ? {
              url: baja.url_es || baja.url,
              dificultad: baja.difficulty,
              notas: baja.notes_es || baja.notes || null,
              email: baja.email ?? null,
            }
          : null,
        solicitud: solicitud
          ? {
              id: solicitud.id,
              estado: solicitud.estado,
              base: solicitud.base,
              enviadaEn: solicitud.enviadaEn?.toISOString() ?? null,
              venceEn: solicitud.venceEn?.toISOString() ?? null,
            }
          : null,
      };
    })
  );

  filas.sort(
    (a, b) =>
      PESO_SEVERIDAD[a.severidad] - PESO_SEVERIDAD[b.severidad] ||
      (PESO_DIFICULTAD[a.baja?.dificultad] ?? 5) -
        (PESO_DIFICULTAD[b.baja?.dificultad] ?? 5) ||
      a.nombre.localeCompare(b.nombre)
  );

  const identidad = {
    nombre: escaneo.sujeto.nombre,
    email: escaneo.sujeto.emails[0] ?? null,
    identificadores: [...escaneo.sujeto.emails, ...escaneo.sujeto.alias],
  };

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link
        href={`/escaneo/${token}/informe`}
        className="font-mono text-xs tracking-widest text-(--color-texto-tenue) uppercase hover:text-(--color-texto-suave)"
      >
        ← Volver al informe
      </Link>

      <h1 className="mt-8 text-3xl font-semibold tracking-tight">Plan de limpieza</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-(--color-texto-suave)">
        Ordenado por impacto. Donde hay formulario de baja, se enlaza directo.
        Donde no lo hay, se redacta la solicitud RGPD para que la envíes tú desde
        tu correo, que es lo que le da validez legal.
      </p>

      <TableroBajas token={token} filas={filas} identidad={identidad} />
    </main>
  );
}
