import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const accounts = await db.account.findMany({
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
    const body = await request.json();
    
    if (!body.name) {
      return NextResponse.json(
        { error: 'El nombre de la cuenta es requerido' },
        { status: 400 }
      );
    }

    const newAccount = await db.account.create({
      data: {
        name: body.name,
        size: parseFloat(body.size) || 0,
        target: parseFloat(body.target) || 0,
        dd_limit: parseFloat(body.dd_limit) || 0,
        daily_limit: parseFloat(body.daily_limit) || 0,
        status: body.status || 'ACTIVE',
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
