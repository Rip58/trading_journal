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
Retorna UNICAMENTE un objeto JSON que coincida exactamente con este esquema:
{
  "trades": [
    {
      "date": "YYYY-MM-DD",
      "entry_time": "HH:MM:SS",
      "exit_time": "HH:MM:SS",
      "account": "nombre o código de la cuenta",
      "instrument": "instrumento negociado, ej: NQ Futures, ES Futures, NQ JUN26",
      "direction": "Long" o "Short",
      "qty": número entero (cantidad de contratos/lotes),
      "entry": número decimal (precio de entrada),
      "exit_price": número decimal (precio de salida),
      "gross": número decimal (PnL bruto),
      "commission": número decimal (comisión en negativo, ej: -4),
      "pnl": número decimal (PnL neto = gross + commission),
      "mae": número decimal (excursión adversa máxima),
      "mfe": número decimal (excursión favorable máxima),
      "etd": número decimal,
      "rr": número decimal (relación riesgo-beneficio),
      "result": "Win" o "Loss" o "Break Even",
      "strategy": "nombre de la estrategia",
      "timeframe": "temporalidad, ej: 15s, 1m, 5m",
      "notes": "notas adicionales sobre el trade que observes en esta fila"
    }
  ]
}
Extrae todas las filas que veas en la tabla. Si algún valor no es visible o no se puede deducir, usa un valor por defecto razonable (0 para números, "" para texto, o calcula el pnl neto usando gross y comisión).
Responde EXCLUSIVAMENTE con el JSON plano, sin bloques de código markdown (\`\`\`json), sin explicaciones adicionales y sin rodeos.`
      : `Analiza esta captura de pantalla de un trade (de NinjaTrader, TradingView, MetaTrader, Bulenox, Rithmic, etc.) y extrae los detalles para un diario de trading.
Retorna UNICAMENTE un objeto JSON que coincida exactamente con este esquema:
{
  "date": "YYYY-MM-DD",
  "entry_time": "HH:MM:SS",
  "exit_time": "HH:MM:SS",
  "direction": "Long" o "Short",
  "qty": número entero (cantidad de contratos/lotes),
  "entry": número decimal (precio de entrada),
  "exit_price": número decimal (precio de salida),
  "gross": número decimal (PnL bruto),
  "commission": número decimal (comisión en negativo, ej: -4),
  "pnl": número decimal (PnL neto = gross + commission),
  "mae": número decimal (excursión adversa máxima),
  "mfe": número decimal (excursión favorable máxima),
  "etd": número decimal,
  "rr": número decimal (relación riesgo-beneficio),
  "result": "Win" o "Loss" o "Break Even",
  "strategy": "nombre de la estrategia",
  "timeframe": "temporalidad, ej: 15s, 1m, 5m",
  "notes": "notas adicionales sobre el trade que observes en la imagen"
}
Si algún valor no es visible o no se puede deducir, usa un valor por defecto razonable (0 para números, "" para texto, o calcula el pnl neto usando gross y comisión).
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
