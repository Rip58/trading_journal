import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { token } = await params;

  try {
    const escaneo = await db.escaneo.findUnique({
      where: { token },
      include: {
        sujeto: true,
        hallazgos: {
          where: { confianza: 'ENCONTRADO' },
          orderBy: [{ severidad: 'asc' }, { nombre: 'asc' }],
          take: 200,
        },
      },
    });

    if (!escaneo) {
      return Response.json({ error: 'Escaneo no encontrado.' }, { status: 404 });
    }

    const noConcluyentes = await db.hallazgo.count({
      where: { escaneoId: escaneo.id, confianza: 'NO_CONCLUYENTE' },
    });

    return Response.json({
      token: escaneo.token,
      nivel: escaneo.nivel,
      estado: escaneo.estado,
      progreso: { hechos: escaneo.sitiosHechos, total: escaneo.sitiosTotal },
      hallazgos: escaneo.hallazgos.map((h) => ({
        id: h.id,
        nombre: h.nombre,
        url: h.url,
        dominio: h.dominio,
        severidad: h.severidad,
        datos: h.datos,
      })),
      noConcluyentes,
    });
  } catch (error) {
    console.error('Error leyendo el escaneo:', error);
    return Response.json({ error: 'No se pudo leer el escaneo.' }, { status: 500 });
  }
}
