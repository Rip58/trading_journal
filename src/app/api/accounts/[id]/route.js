import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';

export async function PUT(request, { params }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const accountId = parseInt(id);

    if (!body.name) {
      return NextResponse.json(
        { error: 'El nombre de la cuenta es requerido' },
        { status: 400 }
      );
    }

    // Fetch the old account to check ownership and if name changed
    const oldAccount = await db.account.findUnique({
      where: { id: accountId },
    });

    if (!oldAccount || oldAccount.clerkUserId !== userId) {
      return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });
    }

    let brokerUpdateTime = undefined;
    if (body.brokerUpdateTime !== undefined) {
      brokerUpdateTime = body.brokerUpdateTime === '' || body.brokerUpdateTime === null ? null : body.brokerUpdateTime;
    }

    const updatedAccount = await db.account.update({
      where: { id: accountId },
      data: {
        name: body.name,
        size: parseFloat(body.size) || 0,
        // Only update startSize if explicitly sent — it should almost never change
        ...(body.startSize !== undefined ? {
          startSize: body.startSize === null || body.startSize === '' ? null : parseFloat(body.startSize)
        } : {}),
        target: parseFloat(body.target) || 0,
        dd_limit: parseFloat(body.dd_limit) || 0,
        daily_limit: parseFloat(body.daily_limit) || 0,
        status: body.status || undefined,
        type: body.type || undefined,
        balance: body.balance !== undefined ? (body.balance === null || body.balance === '' ? null : parseFloat(body.balance)) : undefined,
        threshold: body.threshold !== undefined ? (body.threshold === null || body.threshold === '' ? null : parseFloat(body.threshold)) : undefined,
        updateDate: body.updateDate !== undefined ? (body.updateDate === null || body.updateDate === '' ? null : body.updateDate) : undefined,
        activeDays: body.activeDays !== undefined ? (body.activeDays === null || body.activeDays === '' ? null : parseInt(body.activeDays)) : undefined,
        brokerUpdateTime: brokerUpdateTime,
        // Campos del RESUMEN DE CUENTAS de Bulenox
        planId: body.planId !== undefined ? (body.planId === null || body.planId === '' ? null : String(body.planId)) : undefined,
        nextBill: body.nextBill !== undefined ? (body.nextBill === null || body.nextBill === '' ? null : String(body.nextBill)) : undefined,
        maxContracts: body.maxContracts !== undefined ? (body.maxContracts === null || body.maxContracts === '' ? null : parseInt(body.maxContracts)) : undefined,
        closedPnl: body.closedPnl !== undefined ? (body.closedPnl === null || body.closedPnl === '' ? null : parseFloat(body.closedPnl)) : undefined,
        safetyReserve: body.safetyReserve !== undefined ? (body.safetyReserve === null || body.safetyReserve === '' ? null : parseFloat(body.safetyReserve)) : undefined,
        bestPnlDay: body.bestPnlDay !== undefined ? (body.bestPnlDay === null || body.bestPnlDay === '' ? null : String(body.bestPnlDay)) : undefined,
        consistency: body.consistency !== undefined ? (body.consistency === null || body.consistency === '' ? null : String(body.consistency)) : undefined,
      },
    });

    // Cascade name update to all associated trades of this user
    if (oldAccount.name !== body.name) {
      await db.trade.updateMany({
        where: { 
          account: oldAccount.name,
          clerkUserId: userId
        },
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
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { id } = await params;
    const accountId = parseInt(id);

    const oldAccount = await db.account.findUnique({
      where: { id: accountId },
    });

    if (!oldAccount || oldAccount.clerkUserId !== userId) {
      return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });
    }

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
