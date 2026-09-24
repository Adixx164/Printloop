import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

const __dirname = path.dirname(__filename);
const SETTINGS_FILE = path.join(__dirname, '../../../kiosk-settings.json');

export interface KioskSettings {
  apiUrl: string;
  apiKey: string;
  tenantId: string;
  printerUri: string;
  heartbeatInterval: number;
  kioskName: string;
}

const DEFAULT_SETTINGS: KioskSettings = {
  apiUrl: '',
  apiKey: '',
  tenantId: '',
  printerUri: '',
  heartbeatInterval: 15000,
  kioskName: 'PrintLoop Kiosk',
};

let cachedSettings: KioskSettings = { ...DEFAULT_SETTINGS };
let settingsLoaded = false;

export function loadSettings(): KioskSettings {
  if (settingsLoaded) return cachedSettings;
  
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
      cachedSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to load settings, using defaults');
    cachedSettings = { ...DEFAULT_SETTINGS };
  }
  
  settingsLoaded = true;
  return cachedSettings;
}

export function getSettings(): KioskSettings {
  return loadSettings();
}

export async function setSetting(key: keyof KioskSettings, value: unknown): Promise<void> {
  const settings = loadSettings();
  
  const settingsRecord = settings as unknown as Record<string, unknown>;
  settingsRecord[key] = key === 'heartbeatInterval' 
    ? (typeof value === 'number' ? value : Number(value))
    : (typeof value === 'string' ? value : String(value));
  
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    cachedSettings = settings;
    logger.info({ key }, 'Setting updated');
  } catch (error) {
    logger.error({ err: error, key }, 'Failed to save setting');
    throw error;
  }
}

export async function saveSettings(settings: Partial<KioskSettings>): Promise<void> {
  const current = loadSettings();
  const merged = { ...current, ...settings };
  
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2));
    cachedSettings = merged;
    logger.info('Settings saved');
  } catch (error) {
    logger.error({ err: error }, 'Failed to save settings');
    throw error;
  }
}

export function isConfigured(): boolean {
  const settings = loadSettings();
  return !!(settings.apiUrl && settings.apiKey && settings.tenantId && settings.printerUri);
}