import type { WaitlistData, WaitlistResponse } from '../types/waitlist';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export async function submitWaitlist(data: WaitlistData): Promise<WaitlistResponse> {
  const response = await fetch(`${API_BASE}/waitlist`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || 'Something went wrong. Please try again.');
  }

  return result;
}

export async function getWaitlistPosition(type: 'student' | 'shop', identifier: string): Promise<{ position: number; total: number } | null> {
  try {
    const response = await fetch(`${API_BASE}/waitlist/position?type=${type}&identifier=${encodeURIComponent(identifier)}`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function getWaitlistStats(): Promise<{ students: number; shops: number; earlyBirdRemaining: number } | null> {
  try {
    const response = await fetch(`${API_BASE}/waitlist/stats`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}