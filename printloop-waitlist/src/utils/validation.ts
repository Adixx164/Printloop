import type { WaitlistData, FormErrors, StudentWaitlistData, ShopWaitlistData } from '../types/waitlist';

export function validateStudentWaitlist(data: Partial<StudentWaitlistData>): FormErrors {
  const errors: FormErrors = {};

  if (!data.fullName?.trim()) {
    errors.fullName = 'Full name is required';
  } else if (data.fullName.trim().length < 2) {
    errors.fullName = 'Name must be at least 2 characters';
  }

  if (!data.whatsappNumber?.trim()) {
    errors.whatsappNumber = 'WhatsApp number is required';
  } else if (!/^\+?[\d\s-]{10,}$/.test(data.whatsappNumber.replace(/\s/g, ''))) {
    errors.whatsappNumber = 'Enter a valid WhatsApp number';
  }

  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.email = 'Enter a valid email address';
  }

  if (!data.faculty) {
    errors.faculty = 'Select your faculty';
  }

  if (!data.level) {
    errors.level = 'Select your level';
  }

  if (!data.printsMost?.length) {
    errors.printsMost = 'Select at least one option';
  }

  if (!data.currentPrintMethod) {
    errors.currentPrintMethod = 'Select your current print method';
  }

  return errors;
}

export function validateShopWaitlist(data: Partial<ShopWaitlistData>): FormErrors {
  const errors: FormErrors = {};

  if (!data.shopName?.trim()) {
    errors.shopName = 'Shop name is required';
  } else if (data.shopName.trim().length < 2) {
    errors.shopName = 'Shop name must be at least 2 characters';
  }

  if (!data.ownerName?.trim()) {
    errors.ownerName = 'Owner name is required';
  } else if (data.ownerName.trim().length < 2) {
    errors.ownerName = 'Name must be at least 2 characters';
  }

  if (!data.whatsappNumber?.trim()) {
    errors.whatsappNumber = 'WhatsApp number is required';
  } else if (!/^\+?[\d\s-]{10,}$/.test(data.whatsappNumber.replace(/\s/g, ''))) {
    errors.whatsappNumber = 'Enter a valid WhatsApp number';
  }

  if (!data.location) {
    errors.location = 'Select your shop location';
  }

  if (!data.printerModels?.trim()) {
    errors.printerModels = 'Enter your printer model(s)';
  }

  if (!data.computerOS) {
    errors.computerOS = 'Select your computer OS';
  }

  if (!data.internetType) {
    errors.internetType = 'Select your internet type';
  }

  if (!data.dailyVolume || data.dailyVolume < 0) {
    errors.dailyVolume = 'Enter estimated daily print volume';
  }

  if (!data.pricePerPage || data.pricePerPage < 0) {
    errors.pricePerPage = 'Enter your price per page (₦)';
  }

  if (!data.operatingHours?.trim()) {
    errors.operatingHours = 'Enter your operating hours';
  }

  return errors;
}

export function validateWaitlist(data: Partial<WaitlistData>): FormErrors {
  if (data.type === 'student') {
    return validateStudentWaitlist(data as Partial<StudentWaitlistData>);
  }
  if (data.type === 'shop') {
    return validateShopWaitlist(data as Partial<ShopWaitlistData>);
  }
  return { type: 'Select user type' };
}

export function formatWhatsAppNumber(input: string): string {
  const cleaned = input.replace(/[\s-]/g, '');
  if (cleaned.startsWith('234')) return '+' + cleaned;
  if (cleaned.startsWith('0')) return '+234' + cleaned.slice(1);
  if (cleaned.startsWith('+234')) return cleaned;
  return '+234' + cleaned;
}

export function getEarlyBirdStatus(position: number, limit: number = 200): { isEarlyBird: boolean; discountPercent: number; remaining: number } {
  return {
    isEarlyBird: position <= limit,
    discountPercent: position <= limit ? 20 : 0,
    remaining: Math.max(0, limit - position),
  };
}