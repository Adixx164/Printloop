import { AppDataSource } from '../config/database';
import { User } from '../entities/user.entity';

async function main() {
  console.log('Starting...');
  await AppDataSource.initialize();
  console.log('DB initialized');
  const users = await AppDataSource.getRepository(User).find();
  console.log('Users:', users.map(u => ({ email: u.email, name: `${u.firstName} ${u.lastName}` })));
  
  const user = await AppDataSource.getRepository(User).findOne({ where: { email: 'loop@printloop.test' } });
  if (user) {
    user.email = 'loop@printloop.ng';
    await AppDataSource.getRepository(User).save(user);
    console.log('Updated to:', user.email);
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });