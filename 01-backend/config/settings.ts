import { AppDataSource } from './database';
import { SystemSetting } from '../entities/systemSetting.entity';

export type SettingValueType = 'string' | 'number' | 'boolean';

export interface DefaultSetting {
  key: string;
  value: string;
  valueType: SettingValueType;
  category: string;
  description: string;
  isReadOnly?: boolean;
}

/**
 * Canonical catalog of admin-configurable system settings. Add a new entry
 * here and it shows up in the admin Options tab on the next server boot —
 * `ensureSystemSettings()` inserts missing keys without touching values an
 * admin has already changed.
 */
export const DEFAULT_SETTINGS: DefaultSetting[] = [
  // ── Storage ────────────────────────────────────────────────────────────
  { key: 'documentRetentionHours', value: '24', valueType: 'number', category: 'Storage', description: 'How long uploaded files are kept after a job expires or completes.' },
  { key: 'maxFileSizeMb', value: '50', valueType: 'number', category: 'Storage', description: 'Maximum single file upload size in megabytes.' },
  { key: 'allowedFileTypes', value: 'PDF, JPG, PNG', valueType: 'string', category: 'Storage', description: 'Accepted upload formats. PrintLoop prints PDF and images only (read-only).', isReadOnly: true },
  { key: 'maxPagesPerFile', value: '300', valueType: 'number', category: 'Storage', description: 'Reject uploads with more than this many pages.' },
  { key: 'autoDeleteAfterPrint', value: 'true', valueType: 'boolean', category: 'Storage', description: 'Delete the source file immediately after a successful print.' },

  // ── Jobs ───────────────────────────────────────────────────────────────
  { key: 'jobExpiryHours', value: '24', valueType: 'number', category: 'Jobs', description: 'Time before an uncollected job is expired and auto-refunded.' },
  { key: 'maxCopiesPerJob', value: '50', valueType: 'number', category: 'Jobs', description: 'Hard cap on the number of copies in a single job.' },
  { key: 'jobCodeLength', value: '6', valueType: 'number', category: 'Jobs', description: 'Length of the alphanumeric release code printed on receipts.', isReadOnly: true },
  { key: 'defaultPaperSize', value: 'A4', valueType: 'string', category: 'Jobs', description: 'Default paper size pre-selected in the print flow.' },
  { key: 'defaultColorMode', value: 'bw', valueType: 'string', category: 'Jobs', description: 'Default colour mode (bw or color).' },
  { key: 'allowGroupPrinting', value: 'true', valueType: 'boolean', category: 'Jobs', description: 'Enable group/batch print sessions for users.' },
  { key: 'maxGroupParticipants', value: '40', valueType: 'number', category: 'Jobs', description: 'Maximum participants allowed in one group session.' },

  // ── Payments ───────────────────────────────────────────────────────────
  { key: 'walletMinTopUp', value: '100', valueType: 'number', category: 'Payments', description: 'Minimum wallet top-up amount (NGN).' },
  { key: 'walletMaxTopUp', value: '50000', valueType: 'number', category: 'Payments', description: 'Maximum single wallet top-up amount (NGN).' },
  { key: 'walletMaxBalance', value: '100000', valueType: 'number', category: 'Payments', description: 'Cap on total wallet balance to limit fraud exposure (NGN).' },
  { key: 'newUserSignupBonus', value: '0', valueType: 'number', category: 'Payments', description: 'Wallet credit automatically granted to new users (NGN).' },
  { key: 'paystackEnabled', value: 'true', valueType: 'boolean', category: 'Payments', description: 'Allow card / bank top-ups via Paystack.' },
  { key: 'currency', value: 'NGN', valueType: 'string', category: 'Payments', description: 'Platform settlement currency.', isReadOnly: true },

  // ── Notifications ──────────────────────────────────────────────────────
  { key: 'emailNotificationsEnabled', value: 'true', valueType: 'boolean', category: 'Notifications', description: 'Send transactional emails (receipts, refunds, invites).' },
  { key: 'smsNotificationsEnabled', value: 'false', valueType: 'boolean', category: 'Notifications', description: 'Send SMS notifications for job-ready and refunds.' },
  { key: 'lowBalanceThreshold', value: '200', valueType: 'number', category: 'Notifications', description: 'Warn users when wallet balance drops below this (NGN).' },

  // ── Branding ───────────────────────────────────────────────────────────
  { key: 'companyName', value: 'PrintLoop', valueType: 'string', category: 'Branding', description: 'Display name used across emails and the UI.' },
  { key: 'supportEmail', value: 'support@printloop.ng', valueType: 'string', category: 'Branding', description: 'Support contact email shown to users.' },
  { key: 'supportPhone', value: '+234 800 000 0000', valueType: 'string', category: 'Branding', description: 'Support contact phone number.' },

  // ── Printing (print-script policy + IPPS transport) ────────────────────
  { key: 'policyEnabled', value: 'false', valueType: 'boolean', category: 'Printing', description: 'Master switch for server-side print-script policies (evaluated on every kiosk release).' },
  { key: 'policyMaxPagesPerJob', value: '0', valueType: 'number', category: 'Printing', description: 'Block any release over this many pages. 0 = no limit.' },
  { key: 'policyMaxCopiesPerJob', value: '0', valueType: 'number', category: 'Printing', description: 'Silently clamp copies to this maximum. 0 = no limit.' },
  { key: 'policyForceMonochromeOverPages', value: '0', valueType: 'number', category: 'Printing', description: 'Force colour jobs to B&W when total sheets ≥ this. 0 = off.' },
  { key: 'policyForceDuplexOverPages', value: '0', valueType: 'number', category: 'Printing', description: 'Force single-sided jobs to duplex when pages ≥ this. 0 = off.' },
  { key: 'policyDenyColor', value: 'false', valueType: 'boolean', category: 'Printing', description: 'Reject all colour jobs at kiosks.' },
  { key: 'policyBlockedFileTypes', value: '', valueType: 'string', category: 'Printing', description: 'Comma-separated extensions to block at kiosks (e.g. exe,zip).' },
  { key: 'ippSecure', value: 'false', valueType: 'boolean', category: 'Printing', description: 'Use IPPS (IPP over TLS) when talking to printers.' },
  { key: 'ippPort', value: '631', valueType: 'number', category: 'Printing', description: 'Printer IPP/IPPS port.' },
  { key: 'ippPath', value: '/ipp/print', valueType: 'string', category: 'Printing', description: 'IPP request path. IPP Everywhere/AirPrint = /ipp/print; CUPS queues = /printers/<queue-name>.' },
  { key: 'ippTlsRejectUnauthorized', value: 'false', valueType: 'boolean', category: 'Printing', description: 'Verify the printer TLS certificate. Leave off for self-signed appliance certs.' },
  { key: 'ippVersion', value: '2.0', valueType: 'string', category: 'Printing', description: 'IPP protocol version sent in requests (1.0 / 1.1 / 2.0). Sharp MX-series needs 1.1.' },
  { key: 'ippTransport', value: 'ipp', valueType: 'string', category: 'Printing', description: 'Print transport: "ipp" (standard, default) or "raw9100" (TCP raw socket + PJL, for printers whose IPP filter drops anonymous jobs — Sharp MX-series).' },
  { key: 'ippRawPort', value: '9100', valueType: 'number', category: 'Printing', description: 'TCP port used by the raw9100 transport.' },

  // ── System ─────────────────────────────────────────────────────────────
  { key: 'maintenanceMode', value: 'false', valueType: 'boolean', category: 'System', description: 'When enabled, the user-facing app shows a maintenance banner.' },
  { key: 'maintenanceMessage', value: 'We are performing scheduled maintenance. Please check back soon.', valueType: 'string', category: 'System', description: 'Message shown when maintenance mode is on.' },
  { key: 'appVersion', value: '1.0.0', valueType: 'string', category: 'System', description: 'Deployed application version.', isReadOnly: true },
];

/**
 * Idempotent: inserts any catalog setting that doesn't yet exist (matched by
 * key). Never overwrites a value an admin already customised. Safe to call on
 * every boot, including on an already-seeded database.
 */
export async function ensureSystemSettings(): Promise<void> {
  const repo = AppDataSource.getRepository(SystemSetting);
  const existing = await repo.find();
  const existingKeys = new Set(existing.map((s) => s.key));

  // Forced policy reconcile: PrintLoop now prints PDF + images ONLY. This is a
  // product constraint (not a tunable), so correct any stale stored value
  // even on an already-seeded DB.
  const aft = existing.find((s) => s.key === 'allowedFileTypes');
  if (aft && (aft.value !== 'PDF, JPG, PNG' || !aft.isReadOnly)) {
    aft.value = 'PDF, JPG, PNG';
    aft.isReadOnly = true;
    aft.description = 'Accepted upload formats. PrintLoop prints PDF and images only (read-only).';
    await repo.save(aft);
    console.log('Settings: reconciled allowedFileTypes → PDF, JPG, PNG (read-only)');
  }

  const missing = DEFAULT_SETTINGS.filter((d) => !existingKeys.has(d.key));
  if (missing.length === 0) {
    console.log('Settings: catalog up to date.');
    return;
  }

  await repo.save(
    missing.map((d) =>
      repo.create({
        key: d.key,
        value: d.value,
        valueType: d.valueType,
        category: d.category,
        description: d.description,
        isReadOnly: d.isReadOnly ?? false,
      })
    )
  );
  console.log(`Settings: added ${missing.length} new option(s): ${missing.map((m) => m.key).join(', ')}`);
}
