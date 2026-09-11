/**
 * Artifact publication state (Q2-G).
 *
 * A typed, minimal publication boundary. No generated artifact becomes public
 * automatically. State transitions are explicit and fail closed.
 *
 * LOCKS:
 *   PRIVATE_GENERATED != PUBLIC_SAMPLE
 *   SHA256_PRESENT != PUBLICATION_APPROVED
 *   GENERATED != SANITIZED
 *   SANITIZED != APPROVED
 *   PUBLIC_SAMPLE_SELF_APPROVES = NO
 */

import { createHash } from 'crypto';

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
  sanitizedDigest?: string;
}

export interface PublicationTransitionReceipt {
  artifactDigest: string;
  previousState: ArtifactPublicationState;
  newState: ArtifactPublicationState;
  sanitizerResult?: ArtifactSanitizationResult;
  approvalIdentity?: string;
  transitionTimestamp: string;
  valid: boolean;
  reason?: string;
}

const VALID_TRANSITIONS: Record<ArtifactPublicationState, ArtifactPublicationState[]> = {
  PRIVATE_GENERATED: ['SANITIZED'],
  SANITIZED: ['APPROVED_FOR_PUBLICATION'],
  APPROVED_FOR_PUBLICATION: ['PUBLIC_SAMPLE'],
  PUBLIC_SAMPLE: [],
};

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

function computeDigest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

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
  artifact: Record<string, unknown> | Buffer,
  options?: { allowKeys?: string[] },
): ArtifactSanitizationResult {
  if (artifact instanceof Buffer) {
    const issues = ['Buffered bytes cannot be structurally sanitized in this guard; convert to a vetted projection first.'];
    return {
      sanitized: false,
      issues,
      publicationState: 'REJECTED',
      rejectedBecause: 'Raw buffered artifact requires a public projection before sanitization.',
    };
  }
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

  const sanitizedBytes = Buffer.from(JSON.stringify(artifact));
  return {
    sanitized: true,
    issues: [],
    publicationState: 'SANITIZED',
    sanitizedDigest: computeDigest(sanitizedBytes),
  };
}

export function canTransitionTo(
  from: ArtifactPublicationState,
  to: ArtifactPublicationState,
): { valid: boolean; reason?: string } {
  if (from === to) return { valid: true };
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    return {
      valid: false,
      reason: `Transition from ${from} to ${to} is not allowed; allowed: ${allowed.join(', ')}.`,
    };
  }
  return { valid: true };
}

export function transitionPublicationState(
  from: ArtifactPublicationState,
  to: ArtifactPublicationState,
  artifactDigest: string,
  approvalIdentity?: string,
  sanitizerResult?: ArtifactSanitizationResult,
): PublicationTransitionReceipt {
  const t0 = canTransitionTo(from, to);
  if (!t0.valid) {
    return {
      artifactDigest,
      previousState: from,
      newState: from,
      transitionTimestamp: new Date().toISOString(),
      valid: false,
      reason: t0.reason,
    };
  }

  if (to === 'PUBLIC_SAMPLE') {
    if (from !== 'APPROVED_FOR_PUBLICATION') {
      return {
        artifactDigest,
        previousState: from,
        newState: from,
        transitionTimestamp: new Date().toISOString(),
        valid: false,
        reason: 'PUBLIC_SAMPLE requires APPROVED_FOR_PUBLICATION predecessor.',
      };
    }
    if (!sanitizerResult || sanitizerResult.publicationState !== 'SANITIZED') {
      return {
        artifactDigest,
        previousState: from,
        newState: from,
        transitionTimestamp: new Date().toISOString(),
        valid: false,
        reason: 'PUBLIC_SAMPLE requires a SANITIZED sanitization result.',
      };
    }
    if (!approvalIdentity) {
      return {
        artifactDigest,
        previousState: from,
        newState: from,
        transitionTimestamp: new Date().toISOString(),
        valid: false,
        reason: 'PUBLIC_SAMPLE requires an explicit approval identity.',
      };
    }
  }

  return {
    artifactDigest,
    previousState: from,
    newState: to,
    sanitizerResult,
    approvalIdentity,
    transitionTimestamp: new Date().toISOString(),
    valid: true,
  };
}

export function isArtifactApprovedForPublication(
  currentState: ArtifactPublicationState,
  sanitizerResult?: ArtifactSanitizationResult,
): { approved: boolean; reason?: string } {
  // PUBLIC_SAMPLE state alone does not self-approve.
  if (currentState === 'PUBLIC_SAMPLE') {
    return { approved: false, reason: 'PUBLIC_SAMPLE is a state, not a self-approving proof of sanitization and approval.' };
  }
  if (currentState !== 'APPROVED_FOR_PUBLICATION') {
    return { approved: false, reason: `Publication state is ${currentState}; APPROVED_FOR_PUBLICATION required.` };
  }
  if (!sanitizerResult || sanitizerResult.publicationState !== 'SANITIZED') {
    return { approved: false, reason: 'Public sample requires SANITIZED sanitization result.' };
  }
  return { approved: true };
}
