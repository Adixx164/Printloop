import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';

interface WaitlistEntry {
  id: string;
  type: 'student' | 'shop';
  data: Record<string, unknown>;
  createdAt: string;
  position: number;
}

const EARLY_BIRD_LIMIT_STUDENT = 200;
const EARLY_BIRD_LIMIT_SHOP = 5;

const STORAGE_KEY = 'printloop_waitlist';

function getStoredEntries(): WaitlistEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveEntries(entries: WaitlistEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (e) {
    console.error('Failed to save waitlist entries:', e);
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getNextPosition(type: 'student' | 'shop', entries: WaitlistEntry[]): number {
  return entries.filter(e => e.type === type).length + 1;
}

function checkEarlyBird(position: number, type: 'student' | 'shop'): { isEarlyBird: boolean; discountPercent: number } {
  if (type === 'student') {
    return {
      isEarlyBird: position <= EARLY_BIRD_LIMIT_STUDENT,
      discountPercent: position <= EARLY_BIRD_LIMIT_STUDENT ? 20 : 0,
    };
  }
  return {
    isEarlyBird: position <= EARLY_BIRD_LIMIT_SHOP,
    discountPercent: position <= EARLY_BIRD_LIMIT_SHOP ? 0 : 0,
  };
}

function validateStudentData(data: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (!data.fullName || typeof data.fullName !== 'string' || data.fullName.trim().length < 2) {
    errors.push('Full name is required (min 2 characters)');
  }
  if (!data.whatsappNumber || typeof data.whatsappNumber !== 'string' || !/^\+?[\d\s-]{10,}$/.test(data.whatsappNumber.replace(/\s/g, ''))) {
    errors.push('Valid WhatsApp number is required');
  }
  if (data.email && typeof data.email === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push('Invalid email format');
  }
  if (!data.faculty || typeof data.faculty !== 'string') {
    errors.push('Faculty is required');
  }
  if (!data.level || typeof data.level !== 'string') {
    errors.push('Level is required');
  }
  if (!Array.isArray(data.printsMost) || data.printsMost.length === 0) {
    errors.push('At least one print type must be selected');
  }
  if (!data.currentPrintMethod || typeof data.currentPrintMethod !== 'string') {
    errors.push('Current print method is required');
  }
  return errors;
}

function validateShopData(data: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (!data.shopName || typeof data.shopName !== 'string' || data.shopName.trim().length < 2) {
    errors.push('Shop name is required');
  }
  if (!data.ownerName || typeof data.ownerName !== 'string' || data.ownerName.trim().length < 2) {
    errors.push('Owner name is required');
  }
  if (!data.whatsappNumber || typeof data.whatsappNumber !== 'string' || !/^\+?[\d\s-]{10,}$/.test(data.whatsappNumber.replace(/\s/g, ''))) {
    errors.push('Valid WhatsApp number is required');
  }
  if (!data.location || typeof data.location !== 'string') {
    errors.push('Location is required');
  }
  if (!data.printerModels || typeof data.printerModels !== 'string' || data.printerModels.trim().length < 2) {
    errors.push('Printer model(s) required');
  }
  if (!data.computerOS || typeof data.computerOS !== 'string') {
    errors.push('Computer OS is required');
  }
  if (!data.internetType || typeof data.internetType !== 'string') {
    errors.push('Internet type is required');
  }
  if (typeof data.dailyVolume !== 'number' || data.dailyVolume < 0) {
    errors.push('Daily volume must be a positive number');
  }
  if (typeof data.pricePerPage !== 'number' || data.pricePerPage < 0) {
    errors.push('Price per page must be a positive number');
  }
  if (!data.operatingHours || typeof data.operatingHours !== 'string' || data.operatingHours.trim().length < 5) {
    errors.push('Operating hours required');
  }
  return errors;
}

const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}');
      const { type, ...data } = body;

      if (!type || (type !== 'student' && type !== 'shop')) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, message: 'Invalid type. Must be "student" or "shop"' }),
        };
      }

      const entries = getStoredEntries();
      const position = getNextPosition(type, entries);

      let errors: string[] = [];
      if (type === 'student') {
        errors = validateStudentData(data);
      } else {
        errors = validateShopData(data);
      }

      if (errors.length > 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, message: errors.join('; ') }),
        };
      }

      const earlyBird = checkEarlyBird(position, type);

      const entry: WaitlistEntry = {
        id: generateId(),
        type,
        data,
        createdAt: new Date().toISOString(),
        position,
      };

      entries.push(entry);
      saveEntries(entries);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: type === 'student'
            ? earlyBird.isEarlyBird
              ? `You're in the first 200! 20% lifetime discount locked in.`
              : `You're position #${position} on the student waitlist.`
            : earlyBird.isEarlyBird
              ? `You're in the first 5 pilot shops! Month 1 = 0% fees.`
              : `You're applicant #${position}. We'll review within 48 hours.`,
          position,
          isEarlyBird: earlyBird.isEarlyBird,
          discountPercent: earlyBird.discountPercent,
        }),
      };
    } catch (err) {
      console.error('Waitlist submission error:', err);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, message: 'Server error. Please try again.' }),
      };
    }
  }

  if (event.httpMethod === 'GET') {
    const { type, identifier } = event.queryStringParameters || {};

    if (type && identifier) {
      const entries = getStoredEntries();
      const entry = entries.find(e => e.type === type && (e.data.whatsappNumber === identifier || e.data.email === identifier));
      if (entry) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ position: entry.position, total: entries.filter(e => e.type === type).length }),
        };
      }
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Not found' }),
      };
    }

    const entries = getStoredEntries();
    const students = entries.filter(e => e.type === 'student').length;
    const shops = entries.filter(e => e.type === 'shop').length;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        students,
        shops,
        earlyBirdRemainingStudents: Math.max(0, EARLY_BIRD_LIMIT_STUDENT - students),
        earlyBirdRemainingShops: Math.max(0, EARLY_BIRD_LIMIT_SHOP - shops),
      }),
    };
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ message: 'Method not allowed' }),
  };
};

export { handler };