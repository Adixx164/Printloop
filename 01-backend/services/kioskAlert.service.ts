import { In } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Kiosk, KioskStatus } from '../entities/kiosk.entity';
import { TenantMember, TenantMemberRole } from '../entities/tenantMember.entity';
import { User } from '../entities/user.entity';
import { Tenant } from '../entities/tenant.entity';
import { EmailService } from './email.service';
import { SMSService } from './sms.service';

/** Re-alert only after this many minutes have passed since the last alert. */
const ALERT_COOLDOWN_MINUTES = parseInt(
  process.env.KIOSK_ALERT_COOLDOWN_MINUTES || '30',
);

/**
 * After the scheduled worker marks kiosks OFFLINE, call this with the
 * IDs that just transitioned so we can notify the right tenant owner.
 *
 * Rate-limited per-kiosk via `lastOfflineAlertAt` so a kiosk that
 * keeps going offline every scan cycle doesn't spam the owner.
 */
export async function notifyOfflineKiosks(kioskIds: string[]): Promise<void> {
  if (!kioskIds.length) return;

  const kioskRepo = AppDataSource.getRepository(Kiosk);
  const memberRepo = AppDataSource.getRepository(TenantMember);
  const userRepo = AppDataSource.getRepository(User);
  const tenantRepo = AppDataSource.getRepository(Tenant);

  const cooloffCutoff = new Date(Date.now() - ALERT_COOLDOWN_MINUTES * 60_000);

  // Only alert kiosks whose last alert is beyond the cooldown (or never alerted).
  const kiosks = await kioskRepo.find({
    where: { id: In(kioskIds), status: KioskStatus.OFFLINE },
    select: ['id', 'name', 'location', 'tenantId', 'lastOfflineAlertAt'],
  });

  const alertable = kiosks.filter(
    (k) => !k.lastOfflineAlertAt || k.lastOfflineAlertAt < cooloffCutoff,
  );
  if (!alertable.length) return;

  // Group by tenant so we do one lookup per tenant, not per kiosk.
  const byTenant = new Map<string, Kiosk[]>();
  for (const k of alertable) {
    if (!k.tenantId) continue;
    const existing = byTenant.get(k.tenantId) ?? [];
    existing.push(k);
    byTenant.set(k.tenantId, existing);
  }

  const email = new EmailService();
  const sms = new SMSService();

  for (const [tenantId, offlineKiosks] of byTenant) {
    // Find owners and admins for this tenant.
    const members = await memberRepo.find({
      where: {
        tenantId,
        role: In([TenantMemberRole.OWNER, TenantMemberRole.ADMIN]),
      },
      select: ['userId'],
    });
    if (!members.length) continue;

    const ownerIds = members.map((m) => m.userId);
    const users = await userRepo.find({
      where: { id: In(ownerIds) },
      select: ['email', 'phoneNumber', 'firstName'],
    });

    const tenant = await tenantRepo.findOne({
      where: { id: tenantId },
      select: ['name', 'slug'],
    });
    const tenantName = tenant?.name ?? 'your shop';

    const kioskList = offlineKiosks
      .map((k) => `• ${k.name}${k.location ? ` (${k.location})` : ''}`)
      .join('\n');
    const kioskListHtml = offlineKiosks
      .map(
        (k) =>
          `<li><strong>${k.name}</strong>${k.location ? ` — ${k.location}` : ''}</li>`,
      )
      .join('');

    for (const user of users) {
      // Email
      await email
        .send({
          to: user.email,
          subject: `⚠️ Kiosk offline — ${tenantName}`,
          html: `
            <p>Hi ${user.firstName},</p>
            <p>The following kiosk${offlineKiosks.length > 1 ? 's' : ''} at <strong>${tenantName}</strong>
               ${offlineKiosks.length > 1 ? 'have' : 'has'} gone offline:</p>
            <ul>${kioskListHtml}</ul>
            <p>If this is unexpected, please check that the kiosk computer is powered on and
               connected to the internet, then verify the PrintLoop Agent service is running.</p>
            <p>Customers will not be able to print at an offline kiosk. Once the kiosk comes back
               online it will re-appear automatically.</p>
            <p style="font-size:12px;color:#888;">
              You can manage your kiosks at your
              <a href="https://${tenant?.slug}.printloop.app/saas/kiosks">PrintLoop dashboard</a>.
            </p>
          `,
          text: `Hi ${user.firstName},\n\nThese kiosks at ${tenantName} have gone offline:\n${kioskList}\n\nCheck that the kiosk computer is powered on and the PrintLoop Agent is running.`,
        })
        .catch((err) =>
          console.error('[kioskAlert] email send failed:', err),
        );

      // SMS — short message only
      if (user.phoneNumber) {
        const names = offlineKiosks.map((k) => k.name).join(', ');
        await sms
          .send(
            user.phoneNumber,
            `PrintLoop: Kiosk${offlineKiosks.length > 1 ? 's' : ''} offline at ${tenantName}: ${names}. Check kiosk power and internet.`,
          )
          .catch((err) =>
            console.error('[kioskAlert] SMS send failed:', err),
          );
      }
    }

    // Stamp lastOfflineAlertAt on all alerted kiosks.
    await kioskRepo.update(
      { id: In(offlineKiosks.map((k) => k.id)) },
      { lastOfflineAlertAt: new Date() },
    );

    console.log(
      `[kioskAlert] alerted tenant ${tenantId}: ${offlineKiosks.length} kiosk(s) offline`,
    );
  }
}
