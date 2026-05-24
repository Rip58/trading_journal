import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const trades = await db.trade.findMany({
      orderBy: {
        id: 'asc',
      },
    });
    return NextResponse.json(trades);
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
    const body = await request.json();
    
    // Convert and sanitize values if necessary
    const newTrade = await db.trade.create({
      data: {
        date: body.date || new Date().toISOString().slice(0, 10),
        entry_time: body.entry_time || '',
        exit_time: body.exit_time || '',
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
        result: body.result || 'Win',
        strategy: body.strategy || '',
        timeframe: body.timeframe || '15s',
        notes: body.notes || '',
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
