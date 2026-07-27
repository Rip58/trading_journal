import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { normalizeDateToYYYYMMDD, parseLocaleFloat } from '@/lib/dateUtils';

export async function PUT(request, { params }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const tradeId = parseInt(id);

    const oldTrade = await db.trade.findUnique({
      where: { id: tradeId },
    });

    if (!oldTrade || oldTrade.clerkUserId !== userId) {
      return NextResponse.json({ error: 'Trade no encontrado' }, { status: 404 });
    }

    const updatedTrade = await db.trade.update({
      where: { id: tradeId },
      data: {
        date: normalizeDateToYYYYMMDD(body.date),
        entry_time: body.entry_time,
        exit_time: body.exit_time,
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
        result: body.result,
        strategy: body.strategy,
        timeframe: body.timeframe,
        notes: body.notes,
        image: body.image,
        balance: body.balance !== undefined
          ? (body.balance === null || body.balance === '' ? null : parseLocaleFloat(body.balance))
          : undefined,
        threshold: body.threshold !== undefined
          ? (body.threshold === null || body.threshold === '' ? null : parseLocaleFloat(body.threshold))
          : undefined,
      },
    });

    return NextResponse.json(updatedTrade);
  } catch (error) {
    console.error('Error updating trade:', error);
    return NextResponse.json(
      { error: 'Error al actualizar el trade' },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { id } = await params;
    const tradeId = parseInt(id);

    const oldTrade = await db.trade.findUnique({
      where: { id: tradeId },
    });

    if (!oldTrade || oldTrade.clerkUserId !== userId) {
      return NextResponse.json({ error: 'Trade no encontrado' }, { status: 404 });
    }

    await db.trade.delete({
      where: { id: tradeId },
    });

    return NextResponse.json({ message: 'Trade eliminado con éxito' });
  } catch (error) {
    console.error('Error deleting trade:', error);
    return NextResponse.json(
      { error: 'Error al eliminar el trade' },
      { status: 500 }
    );
  }
}
