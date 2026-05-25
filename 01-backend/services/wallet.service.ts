import { AppDataSource } from '../config/database';
import { Wallet } from '../entities/wallet.entity';

/**
 * Atomic wallet debit. Replaces the read-modify-write pattern that
 * lived inline in three routes — that one had a real TOCTOU race
 * (two concurrent prints on one wallet both pass the `>= cost`
 * check and both debit).
 *
 * This implementation is one conditional UPDATE: the row is only
 * touched if it still has enough balance, and the DB returns the
 * affected-row count so we can tell whether we actually got it.
 *
 * Returns:
 *   { debited: true,  balance: <new balance> }  on success
 *   { debited: false, balance: <current> }      on insufficient funds
 *   { debited: false, balance: null }           if the wallet row is missing
 */
export async function tryDebit(
  userId: string,
  amount: number,
): Promise<{ debited: boolean; balance: number | null }> {
  const amt = Math.max(0, Number(amount) || 0);
  if (!userId || amt <= 0) return { debited: false, balance: null };

  const repo = AppDataSource.getRepository(Wallet);
  // Conditional UPDATE — the `balance >= :amt` clause is the lock
  // that closes the race. Affected rows tells us whether anyone else
  // beat us to it.
  const result = await repo
    .createQueryBuilder()
    .update(Wallet)
    .set({ balance: () => 'balance - :amt' })
    .where('userId = :userId AND balance >= :amt', { userId, amt })
    .setParameters({ amt })
    .execute();

  // `affected` is undefined on some drivers; treat undefined as "we
  // can't tell" which we conservatively report as not-debited.
  const debited = (result.affected ?? 0) === 1;

  // Re-read for the new balance — cheap, and the caller usually
  // wants to know what to display.
  const fresh = await repo.findOne({ where: { userId } });
  if (!fresh) return { debited: false, balance: null };
  return { debited, balance: Number(fresh.balance) };
}
