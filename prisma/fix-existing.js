const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Find the account matching BX101840-05
  const accounts = await prisma.account.findMany();
  const targetAccount = accounts.find(a => a.name.startsWith('BX101840-05'));

  if (!targetAccount) {
    console.log('No account starting with "BX101840-05" was found in the database.');
    return;
  }

  console.log(`Found target account in DB: "${targetAccount.name}" (ID: ${targetAccount.id})`);

  // Update all trades that are labeled as "BX101840-05 (50K)" to match the target account name
  const updateResult = await prisma.trade.updateMany({
    where: {
      account: 'BX101840-05 (50K)',
    },
    data: {
      account: targetAccount.name,
    },
  });

  console.log(`Successfully updated ${updateResult.count} trades to account "${targetAccount.name}".`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
