// Importación directa de datos Bulenox -> DB
// Run: node -r dotenv/config importBulenox.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const USER_ID = 'user_3EDmbJT722mcBppxTsSDJnHhR9x';

// ── CUENTAS ──────────────────────────────────────────────────────────────────
// OJO: `size` y `startSize` son el saldo INICIAL de la cuenta. El saldo actual
// del broker va en `balance`. Poner el saldo actual en `size` duplica el PnL,
// porque calcAccountDD() acumula los trades partiendo de `size`.
const ACCOUNTS = [
  {
    clerkUserId: USER_ID,
    name:        'BX101840-12',
    size:        25000,
    startSize:   25000,
    target:      1500,
    dd_limit:    1500,
    daily_limit: 0,
    status:      'ACTIVE',
    type:        'EXAMEN',
    balance:     25510.94,
    threshold:   24069.16,
    updateDate:  '2026-07-24',
    activeDays:  2,
  },
  {
    clerkUserId: USER_ID,
    name:        'BX101840-13',
    size:        25000,
    startSize:   25000,
    target:      1500,
    dd_limit:    1500,
    daily_limit: 0,
    status:      'ACTIVE',
    type:        'EXAMEN',
    balance:     null,
    threshold:   null,
    updateDate:  null,
    activeDays:  null,
  },
  {
    clerkUserId: USER_ID,
    name:        'BX-M101840062061',
    size:        25000,
    startSize:   25000,
    target:      0,
    dd_limit:    1500,
    daily_limit: 0,
    status:      'ACTIVE',
    type:        'REAL',
    balance:     25474.82,
    threshold:   25100.00,
    updateDate:  '2026-07-24',
    activeDays:  28,
  },
];

// ── DATOS DIARIOS (PnL≠0 y sin "Sin datos") ─────────────────────────────────
const RAW_DAILY = [
  { account:'BX101840-12',    date:'2026-07-23', balance:25104,    threshold:23863,    commission:13, pnl:104  },
  { account:'BX101840-12',    date:'2026-07-24', balance:25511,    threshold:24069,    commission:15, pnl:407  },
  { account:'BX-M101840062061', date:'2026-06-11', balance:25417, threshold:23917,    commission:13, pnl:417  },
  { account:'BX-M101840062061', date:'2026-06-12', balance:25208, threshold:23917,    commission:5,  pnl:-210 },
  { account:'BX-M101840062061', date:'2026-06-16', balance:24848, threshold:23955,    commission:4,  pnl:-359 },
  { account:'BX-M101840062061', date:'2026-06-17', balance:25064, threshold:23955,    commission:4,  pnl:216  },
  { account:'BX-M101840062061', date:'2026-06-18', balance:24831, threshold:23955,    commission:8,  pnl:-233 },
  { account:'BX-M101840062061', date:'2026-06-22', balance:24862, threshold:23955,    commission:4,  pnl:31   },
  { account:'BX-M101840062061', date:'2026-06-23', balance:25123, threshold:23955,    commission:8,  pnl:262  },
  { account:'BX-M101840062061', date:'2026-06-24', balance:25397, threshold:23955,    commission:17, pnl:273  },
  { account:'BX-M101840062061', date:'2026-06-25', balance:25667, threshold:24167,    commission:4,  pnl:271  },
  { account:'BX-M101840062061', date:'2026-06-29', balance:26059, threshold:24583,    commission:8,  pnl:392  },
  { account:'BX-M101840062061', date:'2026-06-30', balance:25765, threshold:24667,    commission:4,  pnl:-294 },
  { account:'BX-M101840062061', date:'2026-07-01', balance:26162, threshold:24667,    commission:8,  pnl:397  },
  { account:'BX-M101840062061', date:'2026-07-02', balance:26457, threshold:24957,    commission:4,  pnl:296  },
  { account:'BX-M101840062061', date:'2026-07-06', balance:26349, threshold:24957,    commission:8,  pnl:-108 },
  { account:'BX-M101840062061', date:'2026-07-07', balance:26080, threshold:24957,    commission:4,  pnl:-269 },
  { account:'BX-M101840062061', date:'2026-07-08', balance:25561, threshold:24957,    commission:8,  pnl:-518 },
  { account:'BX-M101840062061', date:'2026-07-09', balance:25597, threshold:24957,    commission:4,  pnl:36   },
  { account:'BX-M101840062061', date:'2026-07-10', balance:25788, threshold:24957,    commission:4,  pnl:191  },
  { account:'BX-M101840062061', date:'2026-07-13', balance:25994, threshold:24957,    commission:4,  pnl:206  },
  { account:'BX-M101840062061', date:'2026-07-14', balance:26347, threshold:24957,    commission:17, pnl:353  },
  { account:'BX-M101840062061', date:'2026-07-15', balance:26543, threshold:25043,    commission:4,  pnl:196  },
  { account:'BX-M101840062061', date:'2026-07-16', balance:26700, threshold:25100,    commission:8,  pnl:157  },
  { account:'BX-M101840062061', date:'2026-07-17', balance:26915, threshold:25100,    commission:4,  pnl:216  },
  { account:'BX-M101840062061', date:'2026-07-20', balance:26308, threshold:25100,    commission:13, pnl:-608 },
  { account:'BX-M101840062061', date:'2026-07-21', balance:26479, threshold:25100,    commission:4,  pnl:171  },
  { account:'BX-M101840062061', date:'2026-07-22', balance:25932, threshold:25100,    commission:17, pnl:-547 },
  { account:'BX-M101840062061', date:'2026-07-23', balance:25668, threshold:25100,    commission:4,  pnl:-264 },
  { account:'BX-M101840062061', date:'2026-07-24', balance:25475, threshold:25100,    commission:20, pnl:-193 },
];

function toTrade(row) {
  const comm = -Math.abs(row.commission); // always negative
  const gross = row.pnl - comm;           // gross = pnl + |commission|
  return {
    clerkUserId: USER_ID,
    date:        row.date,
    entry_time:  '',
    exit_time:   '',
    account:     row.account,
    instrument:  'NQ',
    direction:   '',
    qty:         1,
    entry:       0,
    exit_price:  0,
    gross,
    commission:  comm,
    pnl:         row.pnl,
    mae:         0,
    mfe:         0,
    etd:         0,
    rr:          0,
    result:      row.pnl > 0 ? 'Win' : 'Loss',
    strategy:    'Resumen diario',
    timeframe:   'Diario',
    notes:       `Balance cierre: $${row.balance} | Umbral autoliq.: $${row.threshold}`,
    image:       null,
  };
}

async function main() {
  console.log('▶ Importando cuentas...');
  for (const acct of ACCOUNTS) {
    const result = await prisma.account.upsert({
      where: { clerkUserId_name: { clerkUserId: USER_ID, name: acct.name } },
      update: acct,
      create: acct,
    });
    console.log(`  ✓ Cuenta: ${result.name} (${result.type})`);
  }

  console.log('\n▶ Importando trades diarios...');
  const trades = RAW_DAILY.map(toTrade);
  const created = await prisma.trade.createMany({ data: trades });
  console.log(`  ✓ Trades creados: ${created.count}`);

  const counts = await Promise.all([
    prisma.account.count({ where: { clerkUserId: USER_ID } }),
    prisma.trade.count({ where: { clerkUserId: USER_ID } }),
  ]);
  console.log(`\n✅ BD actualizada: ${counts[0]} cuentas | ${counts[1]} trades`);
}

main()
  .catch(e => { console.error('❌ Error:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
