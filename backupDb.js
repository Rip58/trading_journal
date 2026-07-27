// Full DB backup -> JSON file. Run: node -r dotenv/config backupDb.js
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

async function main() {
  const [accounts, trades, settings] = await Promise.all([
    prisma.account.findMany(),
    prisma.trade.findMany({ orderBy: { id: 'asc' } }),
    prisma.userSettings.findMany(),
  ]);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(__dirname, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `backup-${stamp}.json`);

  const payload = {
    exportedAt: new Date().toISOString(),
    counts: { accounts: accounts.length, trades: trades.length, settings: settings.length },
    data: { accounts, trades, settings },
  };

  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  console.log(`✓ Backup guardado en: ${file}`);
  console.log(`  Cuentas: ${accounts.length} | Trades: ${trades.length} | Settings: ${settings.length}`);
  const sizeMB = (fs.statSync(file).size / (1024 * 1024)).toFixed(2);
  console.log(`  Tamaño: ${sizeMB} MB`);
}

main()
  .catch(e => { console.error('Error en backup:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
