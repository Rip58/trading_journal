import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

function parseBase64(base64Str) {
  const matches = base64Str.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    return {
      mediaType: 'image/jpeg',
      data: base64Str,
    };
  }
  return {
    mediaType: matches[1],
    data: matches[2],
  };
}

export async function POST(request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { image, provider, apiKey, multiple } = await request.json();

    if (!image) {
      return NextResponse.json({ error: 'No se recibió ninguna imagen' }, { status: 400 });
    }
    if (!apiKey) {
      return NextResponse.json({ error: 'Falta la API Key en los ajustes' }, { status: 400 });
    }

    const { mediaType, data } = parseBase64(image);

    const promptText = multiple
      ? `Analiza esta captura de pantalla que contiene una tabla o lista de operaciones de trading (de NinjaTrader, TradingView, MetaTrader, Bulenox, Rithmic, etc.) y extrae los detalles de CADA operación (fila) para un diario de trading.
La tabla tiene típicamente un formato de 22 columnas ordenadas de izquierda a derecha de la siguiente manera:
1. ID/Índice de operación (ej: 9, 10, 11)
2. Instrumento (ej: "NQ JUN26", "ES Futures")
3. Cuenta (ej: "BX101840-03!Bulenox!Bulenox")
4. Estrategia ATM / Nombre (ej: "ATM 1 400-800 x2")
5. Dirección (Long o Short)
6. Cantidad / Volumen (contratos/lotes, ej: 1, 2)
7. Precio de Entrada (ej: 30671,50)
8. Precio de Salida (ej: 30673,75)
9. Fecha y Hora de Entrada (ej: "02/06/2026 21:33:55", formato de fecha DD/MM/YYYY o similar)
10. Fecha y Hora de Salida (ej: "02/06/2026 21:34:47", formato de fecha DD/MM/YYYY o similar)
11. Nombre de Entrada (ej: "Entry")
12. Nombre de Salida (ej: "Close")
13. PnL / Profit (ej: "90,00 $", "150,00 $")
14. Comisión (ej: "0,00 $")
15. Columna extra (generalmente "0,00 $")
16. Columna extra (generalmente "0,00 $")
17. Columna extra (generalmente "0,00 $")
18. Columna extra (generalmente "0,00 $")
19. MAE (Maximum Adverse Excursion) en dólares (ej: "20,00 $", "95,00 $")
20. MFE (Maximum Favorable Excursion) en dólares (ej: "330,00 $", "230,00 $")
21. ETD (End Trade Drawdown) en dólares (ej: "240,00 $", "80,00 $")
22. Columna extra (generalmente "0")

IMPORTANTE:
- Extrae con especial cuidado el MAE (columna 19), MFE (columna 20) y ETD (columna 21). No los omitas ni los confundas con las columnas de ceros.
- La fecha debe ser extraída en formato YYYY-MM-DD. Si en la imagen la fecha está en formato DD/MM/YYYY (ej: 02/06/2026), conviértela a YYYY-MM-DD (ej: 2026-06-02).
- Para los números decimales, elimina el símbolo de moneda ($) y convierte el formato de coma decimal a punto (ej: "150,00" -> 150).
- Si un campo no es visible en la imagen o no se puede deducir de ninguna manera, establécelo como null. No inventes datos.

Retorna UNICAMENTE un objeto JSON que coincida exactamente con este esquema:
{
  "trades": [
    {
      "date": "YYYY-MM-DD" o null,
      "entry_time": "HH:MM:SS" o null,
      "exit_time": "HH:MM:SS" o null,
      "account": "nombre o código de la cuenta" o null,
      "instrument": "instrumento negociado" o null,
      "direction": "Long" o "Short" o null,
      "qty": número entero o null,
      "entry": número decimal o null,
      "exit_price": número decimal o null,
      "gross": número decimal o null,
      "commission": número decimal o null,
      "pnl": número decimal o null,
      "mae": número decimal o null,
      "mfe": número decimal o null,
      "etd": número decimal o null,
      "rr": número decimal o null,
      "result": "Win" o "Loss" o "Break Even" o null,
      "strategy": "nombre de la estrategia" o null,
      "timeframe": "temporalidad" o null,
      "notes": "notas adicionales" o null
    }
  ]
}
Responde EXCLUSIVAMENTE con el JSON plano, sin bloques de código markdown (\`\`\`json), sin explicaciones adicionales y sin rodeos.`
      : `Analiza esta captura de pantalla de un trade (de NinjaTrader, TradingView, MetaTrader, Bulenox, Rithmic, etc.) y extrae los detalles para un diario de trading.
Si la captura es una tabla o fila, las columnas están ordenadas de izquierda a derecha de la siguiente manera:
1. ID/Índice de operación
2. Instrumento (ej: "NQ JUN26")
3. Cuenta (ej: "BX101840-03!Bulenox!Bulenox")
4. Estrategia ATM / Nombre
5. Dirección (Long o Short)
6. Cantidad / Volumen (contratos/lotes)
7. Precio de Entrada
8. Precio de Salida
9. Fecha y Hora de Entrada
10. Fecha y Hora de Salida
11. Nombre de Entrada
12. Nombre de Salida
13. PnL / Profit (ej: "150,00 $")
14. Comisión (ej: "0,00 $")
15. Columna extra (0,00 $)
16. Columna extra (0,00 $)
17. Columna extra (0,00 $)
18. Columna extra (0,00 $)
19. MAE (Maximum Adverse Excursion) en dólares (ej: "95,00 $")
20. MFE (Maximum Favorable Excursion) en dólares (ej: "230,00 $")
21. ETD (End Trade Drawdown) en dólares (ej: "80,00 $")
22. Columna extra (0)

IMPORTANTE:
- Extrae con especial cuidado el MAE (columna 19), MFE (columna 20) y ETD (columna 21). No los omitas.
- La fecha debe ser extraída en formato YYYY-MM-DD. Si en la imagen la fecha está en formato DD/MM/YYYY (ej: 02/06/2026), conviértela a YYYY-MM-DD (ej: 2026-06-02).
- Para los números decimales, elimina el símbolo de moneda ($) y convierte el formato de coma decimal a punto (ej: "150,00" -> 150).
- Si un campo no es visible en la imagen o no se puede deducir de ninguna manera, establécelo como null. No inventes datos.

Retorna UNICAMENTE un objeto JSON que coincida exactamente con este esquema:
{
  "date": "YYYY-MM-DD" o null,
  "entry_time": "HH:MM:SS" o null,
  "exit_time": "HH:MM:SS" o null,
  "account": "nombre o código de la cuenta" o null,
  "instrument": "instrumento negociado" o null,
  "direction": "Long" o "Short" o null,
  "qty": número entero o null,
  "entry": número decimal o null,
  "exit_price": número decimal o null,
  "gross": número decimal o null,
  "commission": número decimal o null,
  "pnl": número decimal o null,
  "mae": número decimal o null,
  "mfe": número decimal o null,
  "etd": número decimal o null,
  "rr": número decimal o null,
  "result": "Win" o "Loss" o "Break Even" o null,
  "strategy": "nombre de la estrategia" o null,
  "timeframe": "temporalidad" o null,
  "notes": "notas adicionales" o null
}
Responde EXCLUSIVAMENTE con el JSON plano, sin bloques de código markdown (\`\`\`json), sin explicaciones adicionales y sin rodeos.`;

    let responseJson = null;

    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: promptText },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mediaType};base64,${data}`,
                  },
                },
              ],
            },
          ],
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI Error: ${response.status} - ${errText}`);
      }

      const resData = await response.json();
      responseJson = JSON.parse(resData.choices[0].message.content.trim());

    } else if (provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mediaType,
                    data: data,
                  },
                },
                { type: 'text', text: promptText },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Anthropic Error: ${response.status} - ${errText}`);
      }

      const resData = await response.json();
      const textContent = resData.content[0].text;
      
      // Extract JSON in case there is some text wrapper
      const jsonStart = textContent.indexOf('{');
      const jsonEnd = textContent.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        responseJson = JSON.parse(textContent.slice(jsonStart, jsonEnd + 1));
      } else {
        responseJson = JSON.parse(textContent.trim());
      }

    } else if (provider === 'gemini') {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: promptText },
                  {
                    inlineData: {
                      mimeType: mediaType,
                      data: data,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: 'application/json',
            },
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini Error: ${response.status} - ${errText}`);
      }

      const resData = await response.json();
      const textContent = resData.candidates[0].content.parts[0].text;
      responseJson = JSON.parse(textContent.trim());

    } else if (provider === 'deepseek') {
      // DeepSeek's deepseek-chat model does NOT support image/vision input.
      // Return a friendly error guiding the user to use Gemini (free) instead.
      return NextResponse.json(
        {
          error: 'DeepSeek (deepseek-chat) no soporta análisis de imágenes. Por favor, selecciona Gemini (gratuito) o OpenAI en Ajustes ⚙️ para usar la importación por imagen.'
        },
        { status: 400 }
      );

    } else {
      return NextResponse.json({ error: 'Proveedor de IA no soportado' }, { status: 400 });
    }

    return NextResponse.json(responseJson);

  } catch (error) {
    console.error('Error in parse-trade API:', error);
    return NextResponse.json(
      { error: error.message || 'Error al procesar la imagen con la IA' },
      { status: 500 }
    );
  }
}
