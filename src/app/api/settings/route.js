import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const settings = await db.userSettings.findUnique({
      where: {
        clerkUserId: userId,
      },
    });

    return NextResponse.json(settings || {});
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { error: 'Error al recuperar la configuración' },
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

    const updatedSettings = await db.userSettings.upsert({
      where: {
        clerkUserId: userId,
      },
      update: {
        layout: body.layout !== undefined ? body.layout : undefined,
        visibility: body.visibility !== undefined ? body.visibility : undefined,
        theme: body.theme !== undefined ? body.theme : undefined,
        acctFilter: body.acctFilter !== undefined ? body.acctFilter : undefined,
        accountsPanelFilter: body.accountsPanelFilter !== undefined ? body.accountsPanelFilter : undefined,
        aiProvider: body.aiProvider !== undefined ? body.aiProvider : undefined,
        aiKey: body.aiKey !== undefined ? body.aiKey : undefined,
      },
      create: {
        clerkUserId: userId,
        layout: body.layout || null,
        visibility: body.visibility || null,
        theme: body.theme || null,
        acctFilter: body.acctFilter || null,
        accountsPanelFilter: body.accountsPanelFilter || null,
        aiProvider: body.aiProvider || null,
        aiKey: body.aiKey || null,
      },
    });

    return NextResponse.json(updatedSettings);
  } catch (error) {
    console.error('Error saving settings:', error);
    return NextResponse.json(
      { error: 'Error al guardar la configuración' },
      { status: 500 }
    );
  }
}
