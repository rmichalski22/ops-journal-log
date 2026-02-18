/**
 * Basic regex patterns to detect common secrets in text fields.
 * If detected, require explicit user confirmation before saving.
 */

const PATTERNS = [
  /\b(?:api[_-]?key|apikey)\s*[=:]\s*['"]?[\w\-]{16,}['"]?/i,
  /\b(?:secret|password|passwd|pwd)\s*[=:]\s*['"]?[^\s'"]{8,}['"]?/i,
  /\b[A-Za-z0-9+/]{40,}={0,2}\b/, // long base64
  /\bghp_[A-Za-z0-9]{36}\b/,      // GitHub personal access token
  /\bgho_[A-Za-z0-9]{36}\b/,      // GitHub OAuth
  /\bAKIA[0-9A-Z]{16}\b/,         // AWS access key
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
];

export function scanForSecrets(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  return PATTERNS.some((p) => p.test(text));
}

export function scanRecordForSecrets(data: {
  title?: string;
  description?: string;
  reason?: string;
  links?: string[];
}): boolean {
  const toScan = [
    data.title,
    data.description,
    data.reason,
    ...(data.links ?? []),
  ].filter(Boolean) as string[];
  return toScan.some(scanForSecrets);
}
