import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const accountId = parseInt(id);

    if (!body.name) {
      return NextResponse.json(
        { error: 'El nombre de la cuenta es requerido' },
        { status: 400 }
      );
    }

    // Fetch the old account to check if name changed
    const oldAccount = await db.account.findUnique({
      where: { id: accountId },
    });

    const updatedAccount = await db.account.update({
      where: { id: accountId },
      data: {
        name: body.name,
        size: parseFloat(body.size) || 0,
        target: parseFloat(body.target) || 0,
        dd_limit: parseFloat(body.dd_limit) || 0,
        daily_limit: parseFloat(body.daily_limit) || 0,
      },
    });

    // Cascade name update to all associated trades
    if (oldAccount && oldAccount.name !== body.name) {
      await db.trade.updateMany({
        where: { account: oldAccount.name },
        data: { account: body.name },
      });
    }

    return NextResponse.json(updatedAccount);
  } catch (error) {
    console.error('Error updating account:', error);
    return NextResponse.json(
      { error: 'Error al actualizar la cuenta' },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const accountId = parseInt(id);

    await db.account.delete({
      where: { id: accountId },
    });

    return NextResponse.json({ message: 'Cuenta eliminada con éxito' });
  } catch (error) {
    console.error('Error deleting account:', error);
    return NextResponse.json(
      { error: 'Error al eliminar la cuenta' },
      { status: 500 }
    );
  }
}
