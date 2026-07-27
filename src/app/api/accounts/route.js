import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const accounts = await db.account.findMany({
      where: {
        clerkUserId: userId,
      },
      orderBy: {
        name: 'asc',
      },
    });
    return NextResponse.json(accounts);
  } catch (error) {
    console.error('Error fetching accounts:', error);
    return NextResponse.json(
      { error: 'Error al recuperar las cuentas' },
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
    
    if (!body.name) {
      return NextResponse.json(
        { error: 'El nombre de la cuenta es requerido' },
        { status: 400 }
      );
    }

    const newAccount = await db.account.create({
      data: {
        clerkUserId: userId,
        name: body.name,
        size: parseFloat(body.size) || 0,
        // startSize = original starting balance (set once at creation, never changes)
        startSize: body.startSize !== undefined && body.startSize !== null && body.startSize !== ''
          ? parseFloat(body.startSize)
          : parseFloat(body.size) || 0,
        target: parseFloat(body.target) || 0,
        dd_limit: parseFloat(body.dd_limit) || 0,
        daily_limit: parseFloat(body.daily_limit) || 0,
        status: body.status || 'ACTIVE',
        type: body.type || 'EXAMEN',
        balance: body.balance !== undefined && body.balance !== null && body.balance !== '' ? parseFloat(body.balance) : null,
        threshold: body.threshold !== undefined && body.threshold !== null && body.threshold !== '' ? parseFloat(body.threshold) : null,
        updateDate: body.updateDate !== undefined && body.updateDate !== null && body.updateDate !== '' ? body.updateDate : null,
        activeDays: body.activeDays !== undefined && body.activeDays !== null && body.activeDays !== '' ? parseInt(body.activeDays) : null,
        brokerUpdateTime: body.brokerUpdateTime !== undefined && body.brokerUpdateTime !== '' && body.brokerUpdateTime !== null ? body.brokerUpdateTime : null,
        // Campos del RESUMEN DE CUENTAS de Bulenox
        planId: body.planId !== undefined && body.planId !== null && body.planId !== '' ? String(body.planId) : null,
        nextBill: body.nextBill !== undefined && body.nextBill !== null && body.nextBill !== '' ? String(body.nextBill) : null,
        maxContracts: body.maxContracts !== undefined && body.maxContracts !== null && body.maxContracts !== '' ? parseInt(body.maxContracts) : null,
        closedPnl: body.closedPnl !== undefined && body.closedPnl !== null && body.closedPnl !== '' ? parseFloat(body.closedPnl) : null,
        safetyReserve: body.safetyReserve !== undefined && body.safetyReserve !== null && body.safetyReserve !== '' ? parseFloat(body.safetyReserve) : null,
        bestPnlDay: body.bestPnlDay !== undefined && body.bestPnlDay !== null && body.bestPnlDay !== '' ? String(body.bestPnlDay) : null,
        consistency: body.consistency !== undefined && body.consistency !== null && body.consistency !== '' ? String(body.consistency) : null,
      },
    });
    
    return NextResponse.json(newAccount, { status: 201 });
  } catch (error) {
    console.error('Error creating account:', error);
    return NextResponse.json(
      { error: 'Error al crear la cuenta' },
      { status: 500 }
    );
  }
}
