/**
 * Artifact publication state (Q1-D).
 *
 * A typed, minimal publication boundary. No generated artifact becomes public
 * automatically.
 *
 * LOCKS:
 *   PRIVATE_GENERATED != PUBLIC_SAMPLE
 *   SHA256_PRESENT != PUBLICATION_APPROVED
 *   GENERATED != SANITIZED
 *   SANITIZED != APPROVED
 */

export const ARTIFACT_PUBLICATION_STATES = [
  'PRIVATE_GENERATED',
  'SANITIZED',
  'APPROVED_FOR_PUBLICATION',
  'PUBLIC_SAMPLE',
] as const;

export type ArtifactPublicationState = (typeof ARTIFACT_PUBLICATION_STATES)[number];

export interface ArtifactSanitizationResult {
  sanitized: boolean;
  issues: string[];
  publicationState: 'SANITIZED' | 'REJECTED';
  rejectedBecause?: string;
}

const SENSITIVE_KEYS = [
  'organizationId',
  'userId',
  'tenantId',
  'orgId',
  'createdBy',
  'updatedBy',
  'token',
  'apiKey',
  'api_key',
  'secret',
  'password',
  'credential',
  'privateKey',
  'Authorization',
];

const ABSOLUTE_PATH_PATTERN = /[A-Z]:[\\/]|(?:^|\s)[\\/][A-Za-z0-9_.-]+(?:[\\/][A-Za-z0-9_.-]+)+/;
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_PATTERN = /(?:\+?\d{1,2}\s?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/;
const URL_WITH_SECRET_PATTERN = /https?:\/\/[^\s"'<>]+[:@][^\s"'<>@]+@/;

function scanForSensitiveStrings(value: unknown, path: string, issues: string[]): void {
  if (value === null || value === undefined) return;

  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    for (const key of SENSITIVE_KEYS) {
      if (lower.includes(key.toLowerCase())) {
        issues.push(`Potential sensitive key at ${path}: contains "${key}"`);
      }
    }
    if (ABSOLUTE_PATH_PATTERN.test(value)) {
      issues.push(`Absolute local path at ${path}`);
    }
    if (URL_WITH_SECRET_PATTERN.test(value)) {
      issues.push(`Secret-bearing URL at ${path}`);
    }
    if (EMAIL_PATTERN.test(value)) {
      issues.push(`Email-like value at ${path}`);
    }
    if (PHONE_PATTERN.test(value)) {
      issues.push(`Phone-like value at ${path}`);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const [i, item] of value.entries()) {
      scanForSensitiveStrings(item, `${path}[${i}]`, issues);
    }
    return;
  }

  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      const keyLower = k.toLowerCase();
      for (const sensitive of SENSITIVE_KEYS) {
        if (keyLower.includes(sensitive.toLowerCase())) {
          issues.push(`Sensitive key name at ${path}.${k}`);
        }
      }
      scanForSensitiveStrings(v, `${path}.${k}`, issues);
    }
  }
}

export function sanitizeArtifactForPublicSample(
  artifact: Record<string, unknown>,
  options?: { allowKeys?: string[] },
): ArtifactSanitizationResult {
  const issues: string[] = [];
  scanForSensitiveStrings(artifact, 'artifact', issues);

  if (issues.length > 0) {
    return {
      sanitized: false,
      issues,
      publicationState: 'REJECTED',
      rejectedBecause: 'Sanitization guard rejected public transition; artifact contains sensitive/private fields.',
    };
  }

  return {
    sanitized: true,
    issues: [],
    publicationState: 'SANITIZED',
  };
}

export function isArtifactApprovedForPublication(
  currentState: ArtifactPublicationState,
  sanitizerResult?: ArtifactSanitizationResult,
): { approved: boolean; reason?: string } {
  if (currentState === 'PUBLIC_SAMPLE') {
    return { approved: true };
  }
  if (currentState !== 'APPROVED_FOR_PUBLICATION') {
    return { approved: false, reason: `Publication state is ${currentState}; APPROVED_FOR_PUBLICATION required.` };
  }
  if (!sanitizerResult || sanitizerResult.publicationState !== 'SANITIZED') {
    return { approved: false, reason: 'Public sample requires SANITIZED sanitization result.' };
  }
  return { approved: true };
}
