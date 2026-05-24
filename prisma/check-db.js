const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const accounts = await prisma.account.findMany();
  console.log('Accounts in DB:');
  console.log(accounts);

  const distinctTradeAccounts = await prisma.trade.groupBy({
    by: ['account'],
    _count: {
      account: true,
    },
  });
  console.log('\nDistinct Accounts in Trades:');
  console.log(distinctTradeAccounts);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
