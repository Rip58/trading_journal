import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const totalTrades = await db.trade.count();
    const totalAccounts = await db.account.count();
    
    // Fetch all unique account names from trades
    const tradesAccounts = await db.trade.groupBy({
      by: ['account'],
      _count: {
        account: true,
      },
    });

    // Fetch all accounts
    const dbAccounts = await db.account.findMany();
    const dbAccountNames = new Set(dbAccounts.map(a => a.name));

    // Identify orphaned trades
    const orphans = [];
    let totalOrphansCount = 0;

    for (const group of tradesAccounts) {
      if (!dbAccountNames.has(group.account)) {
        orphans.push({
          accountName: group.account,
          tradeCount: group._count.account,
        });
        totalOrphansCount += group._count.account;
      }
    }

    // Database structure description
    const structure = {
      Account: [
        { name: 'id', type: 'Int', detail: 'Clave primaria autoincremental' },
        { name: 'name', type: 'String', detail: 'Nombre único de la cuenta' },
        { name: 'size', type: 'Float', detail: 'Balance o tamaño inicial ($)' },
        { name: 'target', type: 'Float', detail: 'Objetivo de beneficio ($)' },
        { name: 'dd_limit', type: 'Float', detail: 'Límite de Drawdown ($)' },
        { name: 'daily_limit', type: 'Float', detail: 'Límite de pérdida diaria ($)' },
        { name: 'status', type: 'String', detail: 'Estado de la cuenta (ACTIVE / CLOSED / BURNED)' },
        { name: 'createdAt', type: 'DateTime', detail: 'Fecha de creación' },
      ],
      Trade: [
        { name: 'id', type: 'Int', detail: 'Clave primaria autoincremental' },
        { name: 'date', type: 'String', detail: 'Fecha del trade (YYYY-MM-DD)' },
        { name: 'entry_time', type: 'String', detail: 'Hora de entrada' },
        { name: 'exit_time', type: 'String', detail: 'Hora de salida' },
        { name: 'account', type: 'String', detail: 'Nombre de la cuenta asociada' },
        { name: 'instrument', type: 'String', detail: 'Activo / Instrumento (ej: NQ)' },
        { name: 'direction', type: 'String', detail: 'Dirección (Long / Short)' },
        { name: 'qty', type: 'Int', detail: 'Cantidad de contratos / lotes' },
        { name: 'entry', type: 'Float', detail: 'Precio de entrada' },
        { name: 'exit_price', type: 'Float', detail: 'Precio de salida' },
        { name: 'gross', type: 'Float', detail: 'PnL Bruto ($)' },
        { name: 'commission', type: 'Float', detail: 'Comisión cobrada ($)' },
        { name: 'pnl', type: 'Float', detail: 'PnL Neto ($)' },
        { name: 'mae', type: 'Float', detail: 'Excursión Adversa Máxima' },
        { name: 'mfe', type: 'Float', detail: 'Excursión Favorable Máxima' },
        { name: 'etd', type: 'Float', detail: 'Drawdown durante el trade' },
        { name: 'rr', type: 'Float', detail: 'Ratio Riesgo / Beneficio (R)' },
        { name: 'result', type: 'String', detail: 'Resultado (Win / Loss / Break Even)' },
        { name: 'strategy', type: 'String', detail: 'Estrategia empleada' },
        { name: 'timeframe', type: 'String', detail: 'Temporalidad (ej: 15s, 1m)' },
        { name: 'notes', type: 'String', detail: 'Comentarios u observaciones' },
        { name: 'image', type: 'String', detail: 'Captura de pantalla de la operativa (Base64)' },
        { name: 'createdAt', type: 'DateTime', detail: 'Fecha de inserción' },
      ],
    };

    return NextResponse.json({
      integrity: {
        status: totalOrphansCount === 0 ? 'healthy' : 'warning',
        message: totalOrphansCount === 0 
          ? 'Todos los trades están correctamente vinculados a cuentas existentes.' 
          : `Se encontraron ${totalOrphansCount} trades sin cuenta asociada en la base de datos.`,
        totalTrades,
        totalAccounts,
        orphans,
        totalOrphansCount,
      },
      structure,
    });

  } catch (error) {
    console.error('Error checking DB status:', error);
    return NextResponse.json({ error: 'Error al consultar la integridad' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { action, targetAccount, missingAccountName } = await request.json();

    if (action === 'create_missing') {
      if (!missingAccountName) {
        return NextResponse.json({ error: 'Nombre de cuenta faltante' }, { status: 400 });
      }
      const newAccount = await db.account.create({
        data: {
          name: missingAccountName,
          size: 50000,
          target: 3000,
          dd_limit: 2500,
          daily_limit: 1100,
        },
      });
      return NextResponse.json({ success: true, message: `Cuenta "${missingAccountName}" creada exitosamente con valores por defecto.` });
    }

    if (action === 'relink_all') {
      if (!missingAccountName || !targetAccount) {
        return NextResponse.json({ error: 'Faltan parámetros para la re-vinculación' }, { status: 400 });
      }
      const result = await db.trade.updateMany({
        where: { account: missingAccountName },
        data: { account: targetAccount },
      });
      return NextResponse.json({ success: true, message: `Se migraron con éxito ${result.count} trades a la cuenta "${targetAccount}".` });
    }

    if (action === 'clean_database') {
      await db.trade.deleteMany({});
      await db.account.deleteMany({});
      return NextResponse.json({ success: true, message: 'La base de datos se ha vaciado por completo (cuentas y trades eliminados).' });
    }

    return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 });
  } catch (error) {
    console.error('Error repairing DB integrity:', error);
    return NextResponse.json({ error: 'Error al reparar la base de datos' }, { status: 500 });
  }
}
