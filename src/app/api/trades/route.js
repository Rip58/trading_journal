import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';

// Sin esto el navegador puede servir de su caché una respuesta anterior, y
// entonces editar los trades no se refleja hasta recargar del todo.
export const dynamic = 'force-dynamic';
import { normalizeDateToYYYYMMDD, parseLocaleFloat } from '@/lib/dateUtils';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const trades = await db.trade.findMany({
      where: {
        clerkUserId: userId,
      },
      orderBy: {
        id: 'asc',
      },
    });
    return NextResponse.json(trades, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Error fetching trades:', error);
    return NextResponse.json(
      { error: 'Error al recuperar los trades' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    
    // Convert and sanitize values if necessary
    const newTrade = await db.trade.create({
      data: {
        clerkUserId: userId,
        date: normalizeDateToYYYYMMDD(body.date),
        entry_time: body.entry_time || '',
        exit_time: body.exit_time || '',
        account: body.account,
        instrument: body.instrument,
        direction: body.direction,
        qty: Math.round(parseLocaleFloat(body.qty)) || 1,
        entry: parseLocaleFloat(body.entry),
        exit_price: parseLocaleFloat(body.exit_price),
        gross: parseLocaleFloat(body.gross),
        commission: parseLocaleFloat(body.commission),
        pnl: parseLocaleFloat(body.pnl),
        mae: parseLocaleFloat(body.mae),
        mfe: parseLocaleFloat(body.mfe),
        etd: parseLocaleFloat(body.etd),
        rr: parseLocaleFloat(body.rr),
        result: body.result || 'Win',
        strategy: body.strategy || '',
        timeframe: body.timeframe || '15s',
        notes: body.notes || '',
        image: body.image || null,
        balance: body.balance !== undefined && body.balance !== null && body.balance !== ''
          ? parseLocaleFloat(body.balance)
          : null,
        threshold: body.threshold !== undefined && body.threshold !== null && body.threshold !== ''
          ? parseLocaleFloat(body.threshold)
          : null,
      },
    });
    
    return NextResponse.json(newTrade, { status: 201 });
  } catch (error) {
    console.error('Error creating trade:', error);
    return NextResponse.json(
      { error: 'Error al crear el trade' },
      { status: 500 }
    );
  }
}
