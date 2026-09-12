/**
 * Artifact publication state (Q2-G, Q2-10, Q2-11).
 *
 * A typed, minimal publication boundary. No generated artifact becomes public
 * automatically. State transitions are explicit, digest-bound, and fail closed.
 *
 * LOCKS:
 *   PRIVATE_GENERATED != PUBLIC_SAMPLE
 *   SHA256_PRESENT != PUBLICATION_APPROVED
 *   GENERATED != SANITIZED
 *   SANITIZED != APPROVED
 *   PUBLIC_SAMPLE_SELF_APPROVES = NO
 *   PRIVATE_ARTIFACT != PUBLIC_ARTIFACT
 *   PRIVATE_BYTES_MUTATED = NO
 *   PUBLIC_SAMPLE != PRIVATE_OBJECT_WITH_STATE_CHANGED
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
  sourceArtifactDigest?: string;
  resultArtifactDigest?: string;
  publicProjectionVersion?: string;
  redactedPaths?: string[];
}

export interface PublicationTransitionReceipt {
  sourceArtifactDigest: string;
  resultArtifactDigest: string;
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
  'authorization',
];

const PUBLIC_PROJECTION_VERSION = 'public-projection-0.1.0';

const ABSOLUTE_PATH_PATTERN = /[A-Z]:[\\/]|(?:^|\s)[\\/][A-Za-z0-9_.-]+(?:[\\/][A-Za-z0-9_.-]+)+/;
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_PATTERN = /(?:\+?\d{1,2}\s?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/;
const URL_WITH_SECRET_PATTERN = /https?:\/\/[^\s"'<>]+[:@][^\s"'<>@]+@/;

function computeDigest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function digestOfObject(obj: Record<string, unknown>): string {
  return computeDigest(Buffer.from(JSON.stringify(obj)));
}

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.some((s) => lower.includes(s.toLowerCase()));
}

function redactTokenForString(value: string, path: string): { value: string; redacted: true; reason: string } | null {
  if (URL_WITH_SECRET_PATTERN.test(value)) {
    return { value: 'REDACTED_URL_WITH_SECRET', redacted: true, reason: `Secret-bearing URL at ${path}` };
  }
  if (EMAIL_PATTERN.test(value)) {
    return { value: 'REDACTED_EMAIL', redacted: true, reason: `Email-like value at ${path}` };
  }
  if (PHONE_PATTERN.test(value)) {
    return { value: 'REDACTED_PHONE', redacted: true, reason: `Phone-like value at ${path}` };
  }
  if (ABSOLUTE_PATH_PATTERN.test(value)) {
    return { value: 'REDACTED_ABSOLUTE_PATH', redacted: true, reason: `Absolute local path at ${path}` };
  }
  return null;
}

export interface PublicArtifactProjection {
  privateArtifact: Record<string, unknown>;
  publicArtifact: Record<string, unknown>;
  privateDigest: string;
  publicDigest: string;
  redactedPaths: string[];
  issues: string[];
  projectionVersion: string;
  sanitized: boolean;
  rejectedBecause?: string;
}

export function buildPublicArtifactProjection(privateArtifact: Record<string, unknown>): PublicArtifactProjection {
  const privateDigest = digestOfObject(privateArtifact);

  const publicArtifact: Record<string, unknown> = JSON.parse(JSON.stringify(privateArtifact)) as Record<string, unknown>;
  const redactedPaths: string[] = [];
  const issues: string[] = [];

  function visit(obj: Record<string, unknown>, path: string): boolean {
    let anyRedacted = false;
    for (const [key, value] of Object.entries(obj)) {
      const fieldPath = `${path}.${key}`;
      if (isSensitiveKey(key)) {
        const replacement = `REDACTED_FOR_PUBLIC`;
        obj[key] = replacement;
        redactedPaths.push(`${fieldPath}: ${key}`);
        issues.push(`Redacted sensitive key at ${fieldPath}`);
        anyRedacted = true;
        continue;
      }

      if (typeof value === 'string') {
        const redacted = redactTokenForString(value, fieldPath);
        if (redacted) {
          obj[key] = redacted.value;
          redactedPaths.push(`${fieldPath}: ${redacted.reason}`);
          issues.push(redacted.reason);
          anyRedacted = true;
        }
      } else if (Array.isArray(value)) {
        const newArray: unknown[] = [];
        for (const [i, item] of value.entries()) {
          if (typeof item === 'string') {
            const redacted = redactTokenForString(item, `${fieldPath}[${i}]`);
            if (redacted) {
              newArray.push(redacted.value);
              redactedPaths.push(`${fieldPath}[${i}]: ${redacted.reason}`);
              issues.push(redacted.reason);
              anyRedacted = true;
            } else {
              newArray.push(item);
            }
          } else if (item && typeof item === 'object' && !Array.isArray(item)) {
            const cloned = JSON.parse(JSON.stringify(item)) as Record<string, unknown>;
            visit(cloned, `${fieldPath}[${i}]`);
            newArray.push(cloned);
          } else {
            newArray.push(item);
          }
        }
        obj[key] = newArray;
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        visit(value as Record<string, unknown>, fieldPath);
      }
    }
    return anyRedacted;
  }

  visit(publicArtifact, 'artifact');
  const publicDigest = digestOfObject(publicArtifact);

  return {
    privateArtifact,
    publicArtifact,
    privateDigest,
    publicDigest,
    redactedPaths,
    issues,
    projectionVersion: PUBLIC_PROJECTION_VERSION,
    sanitized: true,
  };
}

export function sanitizeArtifactForPublicSample(
  artifact: Record<string, unknown> | Buffer,
): ArtifactSanitizationResult {
  if (artifact instanceof Buffer) {
    return {
      sanitized: false,
      issues: ['Buffered bytes cannot be structurally sanitized in this guard; convert to a vetted projection first.'],
      publicationState: 'REJECTED',
      rejectedBecause: 'Raw buffered artifact requires a public projection before sanitization.',
    };
  }

  const projection = buildPublicArtifactProjection(artifact as Record<string, unknown>);
  if (!projection.sanitized) {
    return {
      sanitized: false,
      issues: projection.issues,
      publicationState: 'REJECTED',
      rejectedBecause: projection.rejectedBecause,
    };
  }

  return {
    sanitized: true,
    issues: projection.issues,
    publicationState: 'SANITIZED',
    sourceArtifactDigest: projection.privateDigest,
    resultArtifactDigest: projection.publicDigest,
    publicProjectionVersion: projection.projectionVersion,
    redactedPaths: projection.redactedPaths,
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
  previousReceipt?: PublicationTransitionReceipt,
): PublicationTransitionReceipt {
  const t0 = canTransitionTo(from, to);
  if (!t0.valid) {
    return {
      sourceArtifactDigest: artifactDigest,
      resultArtifactDigest: artifactDigest,
      previousState: from,
      newState: from,
      transitionTimestamp: new Date().toISOString(),
      valid: false,
      reason: t0.reason,
    };
  }

  if (previousReceipt) {
    if (previousReceipt.newState !== from) {
      return {
        sourceArtifactDigest: artifactDigest,
        resultArtifactDigest: artifactDigest,
        previousState: from,
        newState: from,
        transitionTimestamp: new Date().toISOString(),
        valid: false,
        reason: 'Receipt chain broken: previous receipt state does not match source state.',
      };
    }
    if (previousReceipt.resultArtifactDigest !== artifactDigest) {
      return {
        sourceArtifactDigest: artifactDigest,
        resultArtifactDigest: artifactDigest,
        previousState: from,
        newState: from,
        transitionTimestamp: new Date().toISOString(),
        valid: false,
        reason: 'Digest mismatch: source artifact digest does not match previous receipt result digest.',
      };
    }
  }

  if (to === 'SANITIZED') {
    if (!sanitizerResult || sanitizerResult.publicationState !== 'SANITIZED' || !sanitizerResult.sanitized) {
      return {
        sourceArtifactDigest: artifactDigest,
        resultArtifactDigest: artifactDigest,
        previousState: from,
        newState: from,
        transitionTimestamp: new Date().toISOString(),
        valid: false,
        reason: 'SANITIZED requires a passing sanitizer result with resultArtifactDigest.',
      };
    }
    if (!sanitizerResult.resultArtifactDigest) {
      return {
        sourceArtifactDigest: artifactDigest,
        resultArtifactDigest: artifactDigest,
        previousState: from,
        newState: from,
        transitionTimestamp: new Date().toISOString(),
        valid: false,
        reason: 'SANITIZED requires a resultArtifactDigest in the sanitizer result.',
      };
    }

    const result: PublicationTransitionReceipt = {
      sourceArtifactDigest: artifactDigest,
      resultArtifactDigest: sanitizerResult.resultArtifactDigest,
      previousState: from,
      newState: to,
      sanitizerResult,
      approvalIdentity,
      transitionTimestamp: new Date().toISOString(),
      valid: true,
    };
    return result;
  }

  if (to === 'APPROVED_FOR_PUBLICATION') {
    if (!sanitizerResult || sanitizerResult.publicationState !== 'SANITIZED' || !sanitizerResult.sanitized) {
      return {
        sourceArtifactDigest: artifactDigest,
        resultArtifactDigest: artifactDigest,
        previousState: from,
        newState: from,
        transitionTimestamp: new Date().toISOString(),
        valid: false,
        reason: 'APPROVED_FOR_PUBLICATION requires a SANITIZED sanitization result.',
      };
    }
    if (!approvalIdentity) {
      return {
        sourceArtifactDigest: artifactDigest,
        resultArtifactDigest: artifactDigest,
        previousState: from,
        newState: from,
        transitionTimestamp: new Date().toISOString(),
        valid: false,
        reason: 'APPROVED_FOR_PUBLICATION requires an explicit approval identity.',
      };
    }
    if (sanitizerResult.resultArtifactDigest && sanitizerResult.resultArtifactDigest !== artifactDigest) {
      return {
        sourceArtifactDigest: artifactDigest,
        resultArtifactDigest: artifactDigest,
        previousState: from,
        newState: from,
        transitionTimestamp: new Date().toISOString(),
        valid: false,
        reason: 'APPROVED_FOR_PUBLICATION digest does not match the sanitized artifact digest.',
      };
    }
  }

  if (to === 'PUBLIC_SAMPLE') {
    if (from !== 'APPROVED_FOR_PUBLICATION') {
      return {
        sourceArtifactDigest: artifactDigest,
        resultArtifactDigest: artifactDigest,
        previousState: from,
        newState: from,
        transitionTimestamp: new Date().toISOString(),
        valid: false,
        reason: 'PUBLIC_SAMPLE requires APPROVED_FOR_PUBLICATION predecessor.',
      };
    }
    if (!sanitizerResult || sanitizerResult.publicationState !== 'SANITIZED') {
      return {
        sourceArtifactDigest: artifactDigest,
        resultArtifactDigest: artifactDigest,
        previousState: from,
        newState: from,
        transitionTimestamp: new Date().toISOString(),
        valid: false,
        reason: 'PUBLIC_SAMPLE requires a SANITIZED sanitization result.',
      };
    }
    if (!approvalIdentity) {
      return {
        sourceArtifactDigest: artifactDigest,
        resultArtifactDigest: artifactDigest,
        previousState: from,
        newState: from,
        transitionTimestamp: new Date().toISOString(),
        valid: false,
        reason: 'PUBLIC_SAMPLE requires an explicit approval identity.',
      };
    }
    if (sanitizerResult.resultArtifactDigest && sanitizerResult.resultArtifactDigest !== artifactDigest) {
      return {
        sourceArtifactDigest: artifactDigest,
        resultArtifactDigest: artifactDigest,
        previousState: from,
        newState: from,
        transitionTimestamp: new Date().toISOString(),
        valid: false,
        reason: 'PUBLIC_SAMPLE digest does not match the sanitized artifact digest.',
      };
    }
  }

  return {
    sourceArtifactDigest: artifactDigest,
    resultArtifactDigest: artifactDigest,
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
