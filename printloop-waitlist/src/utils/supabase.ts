import type { WaitlistData, WaitlistResponse } from '../types/waitlist';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase credentials not configured. Waitlist will use mock mode.');
}

async function supabaseFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY || '',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY || ''}`,
      'Prefer': 'return=representation',
      ...options.headers,
    },
  });
}

export async function submitWaitlistSupabase(data: WaitlistData): Promise<WaitlistResponse> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return mockSubmitWaitlist(data);
  }

  const table = data.type === 'student' ? 'student_waitlist' : 'shop_waitlist';

  const existingResponse = await supabaseFetch(`/${table}?select=count`, {
    method: 'HEAD',
  });

  const position = (parseInt(existingResponse.headers.get('content-range')?.split('/').pop() || '0', 10)) + 1;

  const earlyBirdLimit = data.type === 'student' ? 200 : 5;
  const isEarlyBird = position <= earlyBirdLimit;
  const discountPercent = data.type === 'student' && isEarlyBird ? 20 : 0;

  const insertData = {
    ...data,
    position,
    is_early_bird: isEarlyBird,
    discount_percent: discountPercent,
    created_at: new Date().toISOString(),
  };

  const response = await supabaseFetch(`/${table}`, {
    method: 'POST',
    body: JSON.stringify(insertData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to join waitlist');
  }

  return {
    success: true,
    message: data.type === 'student'
      ? isEarlyBird
        ? `You're in the first 200! 20% lifetime discount locked in.`
        : `You're position #${position} on the student waitlist.`
      : isEarlyBird
        ? `You're in the first 5 pilot shops! Month 1 = 0% fees.`
        : `You're applicant #${position}. We'll review within 48 hours.`,
    position,
    isEarlyBird,
    discountPercent,
  };
}

export async function getWaitlistPositionSupabase(
  type: 'student' | 'shop',
  identifier: string
): Promise<{ position: number; total: number } | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }

  const table = type === 'student' ? 'student_waitlist' : 'shop_waitlist';
  const column = type === 'student' ? 'whatsapp_number' : 'whatsapp_number';

  const response = await supabaseFetch(
    `/${table}?${column}=eq.${encodeURIComponent(identifier)}&select=position`
  );

  if (!response.ok) return null;

  const data = await response.json();
  if (!data.length) return null;

  const totalResponse = await supabaseFetch(`/${table}?select=count`, { method: 'HEAD' });
  const total = parseInt(totalResponse.headers.get('content-range')?.split('/').pop() || '0', 10);

  return { position: data[0].position, total };
}

export async function getWaitlistStatsSupabase(): Promise<{ students: number; shops: number; earlyBirdRemaining: number } | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }

  const [studentsRes, shopsRes] = await Promise.all([
    supabaseFetch('/student_waitlist?select=count', { method: 'HEAD' }),
    supabaseFetch('/shop_waitlist?select=count', { method: 'HEAD' }),
  ]);

  const students = parseInt(studentsRes.headers.get('content-range')?.split('/').pop() || '0', 10);
  const shops = parseInt(shopsRes.headers.get('content-range')?.split('/').pop() || '0', 10);

  return {
    students,
    shops,
    earlyBirdRemaining: Math.max(0, 200 - students),
  };
}

async function mockSubmitWaitlist(data: WaitlistData): Promise<WaitlistResponse> {
  await new Promise(resolve => setTimeout(resolve, 500));
  const position = Math.floor(Math.random() * 50) + 1;
  const isEarlyBird = position <= (data.type === 'student' ? 200 : 5);
  const discountPercent = data.type === 'student' && isEarlyBird ? 20 : 0;

  return {
    success: true,
    message: data.type === 'student'
      ? isEarlyBird
        ? `You're in the first 200! 20% lifetime discount locked in.`
        : `You're position #${position} on the student waitlist.`
      : isEarlyBird
        ? `You're in the first 5 pilot shops! Month 1 = 0% fees.`
        : `You're applicant #${position}. We'll review within 48 hours.`,
    position,
    isEarlyBird,
    discountPercent,
  };
}