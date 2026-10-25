/**
 * One shared contact contract for the safety tab, cached records and SOS view.
 * Old versions of this app cached either ["+358..."] or [{name, phone}].
 * Never construct tel: URLs from arbitrary JSON or from the device message.
 */
export interface DialContact {
  name: string;
  phone: string;
  isPrimary: boolean;
}

export function safeDialNumber(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  // Formatting spaces, parentheses and hyphens are allowed; URI delimiters
  // and service codes are NOT. Only explicit phone-dialer interaction may call.
  const trimmed = input.trim();
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null;
  const normalized = trimmed.replace(/[\s().-]/g, '');
  if (!/^\+?\d{3,15}$/.test(normalized)) return null;
  return normalized;
}

export function normalizeEmergencyContacts(raw: unknown): DialContact[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const contacts: DialContact[] = [];
  for (const entry of raw) {
    const phone = safeDialNumber(typeof entry === 'string' ? entry : entry?.phone);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    const name = typeof entry === 'string' ? 'Emergency Contact' :
      typeof entry?.name === 'string' && entry.name.trim() ?
        entry.name.trim().slice(0, 80) : 'Emergency Contact';
    contacts.push({ name, phone, isPrimary: typeof entry === 'object' &&
      entry !== null && entry.is_primary === true });
  }
  return contacts.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
}
