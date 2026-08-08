import { db } from '@/lib/db';
import { fechaLimite } from '@/lib/cartas';

export const dynamic = 'force-dynamic';

/** Crea o actualiza el estado de una solicitud de baja. */
export async function POST(request) {
  try {
    const { hallazgoId, servicio, canal, base, estado, notas } = await request.json();

    const hallazgo = await db.hallazgo.findUnique({ where: { id: hallazgoId } });
    if (!hallazgo) {
      return Response.json({ error: 'Hallazgo no encontrado.' }, { status: 404 });
    }

    // El plazo del art. 12.3 arranca cuando la persona dice que la envió, no
    // cuando se generó la carta: entre una cosa y otra pueden pasar semanas.
    const enviadaEn = estado === 'ENVIADA' ? new Date() : null;

    const existente = await db.solicitud.findFirst({
      where: { hallazgoId, base: base ?? 'ART17' },
    });

    const datos = {
      servicio,
      canal: canal ?? 'EMAIL',
      base: base ?? 'ART17',
      estado: estado ?? 'PENDIENTE',
      ...(enviadaEn ? { enviadaEn, venceEn: fechaLimite(enviadaEn) } : {}),
      ...(notas !== undefined ? { notas } : {}),
    };

    const solicitud = existente
      ? await db.solicitud.update({ where: { id: existente.id }, data: datos })
      : await db.solicitud.create({ data: { ...datos, hallazgoId } });

    return Response.json(solicitud, { status: existente ? 200 : 201 });
  } catch (error) {
    console.error('Error guardando la solicitud:', error);
    return Response.json({ error: 'No se pudo guardar.' }, { status: 500 });
  }
}
