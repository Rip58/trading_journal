import { crearEscaneo } from '@/lib/escaneo';

export async function POST(request) {
  try {
    const cuerpo = await request.json();

    // La declaración de titularidad no es un trámite: es lo que impide que
    // alguien analice a un tercero, y la base legal cuando esto tenga clientes.
    if (!cuerpo.titularidadAceptada) {
      return Response.json(
        { error: 'Tienes que confirmar que los datos son tuyos.' },
        { status: 400 }
      );
    }

    const { escaneo, descartados } = await crearEscaneo({
      entrada: cuerpo,
      nivel: 'GRATIS',
    });

    if (escaneo.sitiosTotal === 0 && !escaneo.sujeto?.emails?.length) {
      // Sin alias no hay nada que comprobar en los 150 sitios. Se avisa en vez
      // de enseñar un informe vacío que parezca una buena noticia.
      return Response.json(
        {
          token: escaneo.token,
          aviso: 'Sin ningún alias no se puede buscar en los sitios de perfiles.',
          descartados,
        },
        { status: 201 }
      );
    }

    return Response.json({ token: escaneo.token, descartados }, { status: 201 });
  } catch (error) {
    console.error('Error creando el escaneo:', error);
    return Response.json({ error: 'No se pudo crear el escaneo.' }, { status: 500 });
  }
}
