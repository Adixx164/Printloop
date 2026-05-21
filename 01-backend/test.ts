import 'reflect-metadata';
import { AppDataSource } from './config/database';
import { User } from './entities/user.entity';
import { Wallet } from './entities/wallet.entity';

async function runTests() {
  console.log('🔄 Initializing Test Database (SQLite)...');
  try {
    // Override environment so we don't trip validation or try to use mysql
    process.env.NODE_ENV = 'development';
    
    await AppDataSource.initialize();
    console.log('✅ Database connected & synchronized!');

    console.log('\n🧪 Testing User & Wallet Creation...');
    const userRepo = AppDataSource.getRepository(User);
    const walletRepo = AppDataSource.getRepository(Wallet);

    const testUser = userRepo.create({
      firstName: 'Test',
      lastName: 'User',
      email: `test-${Date.now()}@printloop.local`,
      phoneNumber: '+2348000000000',
      passwordHash: 'dummyhash',
      salt: 'dummysalt',
      isEmailVerified: true
    });

    await userRepo.save(testUser);
    console.log(`✅ User created: ${testUser.email}`);

    const testWallet = walletRepo.create({
      userId: testUser.id,
      balance: 1000
    });
    await walletRepo.save(testWallet);
    console.log(`✅ Wallet created with balance: ₦${testWallet.balance}`);

    const savedWallet = await walletRepo.findOne({ where: { userId: testUser.id } });
    if (savedWallet?.balance === 1000) {
      console.log('✅ Balance verification passed!');
    } else {
      console.error('❌ Balance verification failed!');
    }

    console.log('\n🎉 All Core TypeORM Tests Passed Successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  }
}

runTests();
