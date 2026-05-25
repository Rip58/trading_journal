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
        target: parseFloat(body.target) || 0,
        dd_limit: parseFloat(body.dd_limit) || 0,
        daily_limit: parseFloat(body.daily_limit) || 0,
        status: body.status || 'ACTIVE',
        balance: body.balance !== undefined && body.balance !== null && body.balance !== '' ? parseFloat(body.balance) : null,
        threshold: body.threshold !== undefined && body.threshold !== null && body.threshold !== '' ? parseFloat(body.threshold) : null,
        updateDate: body.updateDate !== undefined && body.updateDate !== null && body.updateDate !== '' ? body.updateDate : null,
        activeDays: body.activeDays !== undefined && body.activeDays !== null && body.activeDays !== '' ? parseInt(body.activeDays) : null,
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
