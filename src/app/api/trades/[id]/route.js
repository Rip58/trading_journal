import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const tradeId = parseInt(id);

    const updatedTrade = await db.trade.update({
      where: { id: tradeId },
      data: {
        date: body.date,
        entry_time: body.entry_time,
        exit_time: body.exit_time,
        account: body.account,
        instrument: body.instrument,
        direction: body.direction,
        qty: parseInt(body.qty) || 1,
        entry: parseFloat(body.entry) || 0,
        exit_price: parseFloat(body.exit_price) || 0,
        gross: parseFloat(body.gross) || 0,
        commission: parseFloat(body.commission) || 0,
        pnl: parseFloat(body.pnl) || 0,
        mae: parseFloat(body.mae) || 0,
        mfe: parseFloat(body.mfe) || 0,
        etd: parseFloat(body.etd) || 0,
        rr: parseFloat(body.rr) || 0,
        result: body.result,
        strategy: body.strategy,
        timeframe: body.timeframe,
        notes: body.notes,
        image: body.image,
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
    const { id } = await params;
    const tradeId = parseInt(id);

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
