import { Linking } from 'react-native';

const PHONE_CHARACTERS = /^\+?[\d\s().-]+$/;

export function normalizePhoneNumber(value: string) {
  const trimmed = value.trim();
  const prefix = trimmed.startsWith('+') ? '+' : '';
  return prefix + trimmed.replace(/\D/g, '');
}

export function isValidPhoneNumber(value: string) {
  const trimmed = value.trim();
  if (!PHONE_CHARACTERS.test(trimmed)) return false;
  const normalized = normalizePhoneNumber(trimmed);
  const digits = normalized.replace(/\D/g, '');
  if (normalized.startsWith('+')) return /^[1-9]\d{6,14}$/.test(digits);
  return /^\d{7,15}$/.test(digits);
}

export async function openPhoneDialer(value: string) {
  const phone = normalizePhoneNumber(value);
  if (!isValidPhoneNumber(phone)) throw new Error('The saved phone number is not valid.');
  const url = `tel:${phone}`;
  const supported = await Linking.canOpenURL(url);
  if (!supported) throw new Error('Phone calls are not supported on this device.');
  await Linking.openURL(url);
}
