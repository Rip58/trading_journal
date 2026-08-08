import { ejecutarTanda } from '@/lib/escaneo';

// El escaneo hace peticiones a terceros: nunca debe servirse de caché.
export const dynamic = 'force-dynamic';
// Peor caso ~24s con 40 unidades a concurrencia 10 y 6s de tope cada una.
export const maxDuration = 60;

export async function POST(request, { params }) {
  // Next 16: params es una promesa.
  const { token } = await params;

  try {
    const { desplazamiento = 0 } = await request.json().catch(() => ({}));
    const resultado = await ejecutarTanda({ token, desplazamiento });

    if (!resultado) {
      return Response.json({ error: 'Escaneo no encontrado.' }, { status: 404 });
    }
    return Response.json(resultado);
  } catch (error) {
    console.error('Error ejecutando la tanda:', error);
    return Response.json({ error: 'La tanda falló.' }, { status: 500 });
  }
}
