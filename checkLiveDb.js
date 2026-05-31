const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const accounts = await prisma.account.findMany();
  console.log("--- LIVE ACCOUNTS ---");
  console.log(JSON.stringify(accounts, null, 2));

  const trades = await prisma.trade.findMany({
    orderBy: { id: 'desc' }
  });
  console.log(`\nTotal trades: ${trades.length}`);
  if (trades.length > 0) {
    console.log("Last 5 trades:");
    console.log(JSON.stringify(trades.slice(0, 5), null, 2));
  }
}

main().finally(() => prisma.$disconnect());
