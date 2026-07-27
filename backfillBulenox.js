// Backfill Bulenox: rellena balance/threshold en trades a partir de `notes`
// y completa los campos nuevos del RESUMEN DE CUENTAS de Bulenox.
// Uso: node -r dotenv/config backfillBulenox.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const CLERK_USER_ID = "user_3EDmbJT722mcBppxTsSDJnHhR9x";
const NOTES_RE = /Balance cierre: \$([\d.]+) \| Umbral autoliq\.: \$([\d.]+)/;

const ACCOUNT_PATCHES = [
  { name: "BX101840-12", data: { planId: "1MLBQ", nextBill: "08/23/26", maxContracts: 3, closedPnl: 421.5 } },
  { name: "BX101840-13", data: { planId: "N7FMB", nextBill: "08/27/26", maxContracts: 3 } },
  {
    name: "BX-M101840062061",
    data: {
      closedPnl: -173.5,
      safetyReserve: 26600,
      bestPnlDay: "$417.46 (06/11/26)",
      consistency: "87%",
    },
  },
];

async function main() {
  // ── 1. Trades: parsear notes → balance / threshold ────────────────────────
  const trades = await prisma.trade.findMany({ where: { clerkUserId: CLERK_USER_ID } });
  console.log(`Trades encontrados: ${trades.length}`);

  let updated = 0;
  let skipped = 0;
  for (const t of trades) {
    const m = (t.notes || "").match(NOTES_RE);
    if (!m) {
      skipped++;
      continue;
    }
    const balance = parseFloat(m[1]);
    const threshold = parseFloat(m[2]);
    if (isNaN(balance) || isNaN(threshold)) {
      skipped++;
      continue;
    }
    await prisma.trade.update({ where: { id: t.id }, data: { balance, threshold } });
    updated++;
  }
  console.log(`Trades actualizados: ${updated} · sin match en notes: ${skipped}`);

  // ── 2. Cuentas: campos nuevos del resumen Bulenox ─────────────────────────
  for (const patch of ACCOUNT_PATCHES) {
    const acct = await prisma.account.findFirst({
      where: { clerkUserId: CLERK_USER_ID, name: patch.name },
    });
    if (!acct) {
      console.log(`  ⚠️ Cuenta no encontrada: ${patch.name}`);
      continue;
    }
    await prisma.account.update({ where: { id: acct.id }, data: patch.data });
    console.log(`  ✓ Cuenta actualizada: ${patch.name}`);
  }

  // ── 3. Verificación ───────────────────────────────────────────────────────
  const withBalance = await prisma.trade.count({
    where: { clerkUserId: CLERK_USER_ID, balance: { not: null } },
  });
  console.log(`\nVERIFICACIÓN\nTrades con balance != null: ${withBalance}`);

  const sample = await prisma.trade.findMany({
    where: { clerkUserId: CLERK_USER_ID, balance: { not: null } },
    orderBy: { date: "asc" },
    take: 3,
    select: { id: true, date: true, account: true, pnl: true, commission: true, balance: true, threshold: true },
  });
  console.table(sample);

  const accts = await prisma.account.findMany({
    where: { clerkUserId: CLERK_USER_ID },
    select: {
      name: true, type: true, balance: true, threshold: true, planId: true,
      nextBill: true, maxContracts: true, closedPnl: true, safetyReserve: true,
      bestPnlDay: true, consistency: true,
    },
    orderBy: { name: "asc" },
  });
  console.table(accts);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
