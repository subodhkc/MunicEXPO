/**
 * Exact-evaluation product adapters for Report, Passport and Bundle.
 *
 * Resource-first: ownership check before any evidence load.
 * One shared production bundle owner. No latest-scan fallback.
 */

import { getEvaluationOwnership, loadFullAssuranceEvaluation } from './u6-package-service';
import { buildAssuranceOutputBundle, type AssuranceOutputBundle, type PassportBindingRequest } from './assurance-output-bundle';
import type { AssuranceReport } from './assurance-report-composer';
import type { AgenticProductionPassport } from './agentic-production-passport';

export interface ProductAccessDenied {
  access: 'DENIED';
  reason: 'EVALUATION_NOT_FOUND' | 'ORGANIZATION_MISMATCH';
}

export async function getAssuranceReportProduct(
  evaluationId: string,
  organizationId: string,
): Promise<AssuranceReport | ProductAccessDenied | null> {
  const ownership = await getEvaluationOwnership(evaluationId);
  if (!ownership) return { access: 'DENIED', reason: 'EVALUATION_NOT_FOUND' };
  if (ownership.organizationId !== organizationId) {
    return { access: 'DENIED', reason: 'ORGANIZATION_MISMATCH' };
  }

  const evaluation = await loadFullAssuranceEvaluation(evaluationId);
  if (!evaluation) return { access: 'DENIED', reason: 'EVALUATION_NOT_FOUND' };

  const result = await buildAssuranceOutputBundle(evaluation);
  if (result.availability === 'NOT_AVAILABLE') return null;
  if (!result.bundle) return null;
  return result.bundle.report;
}

export async function getAssurancePassportProduct(
  evaluationId: string,
  organizationId: string,
  passportRequest?: PassportBindingRequest,
): Promise<AgenticProductionPassport | ProductAccessDenied | null> {
  const ownership = await getEvaluationOwnership(evaluationId);
  if (!ownership) return { access: 'DENIED', reason: 'EVALUATION_NOT_FOUND' };
  if (ownership.organizationId !== organizationId) {
    return { access: 'DENIED', reason: 'ORGANIZATION_MISMATCH' };
  }

  const evaluation = await loadFullAssuranceEvaluation(evaluationId);
  if (!evaluation) return { access: 'DENIED', reason: 'EVALUATION_NOT_FOUND' };

  const result = await buildAssuranceOutputBundle(evaluation, undefined, passportRequest);
  if (result.availability === 'NOT_AVAILABLE') return null;
  if (!result.bundle) return null;
  return result.bundle.passport;
}

export async function getAssuranceBundleProduct(
  evaluationId: string,
  organizationId: string,
  passportRequest?: PassportBindingRequest,
): Promise<AssuranceOutputBundle | ProductAccessDenied | null> {
  const ownership = await getEvaluationOwnership(evaluationId);
  if (!ownership) return { access: 'DENIED', reason: 'EVALUATION_NOT_FOUND' };
  if (ownership.organizationId !== organizationId) {
    return { access: 'DENIED', reason: 'ORGANIZATION_MISMATCH' };
  }

  const evaluation = await loadFullAssuranceEvaluation(evaluationId);
  if (!evaluation) return { access: 'DENIED', reason: 'EVALUATION_NOT_FOUND' };

  const result = await buildAssuranceOutputBundle(evaluation, undefined, passportRequest);
  if (result.availability === 'NOT_AVAILABLE') return null;
  if (!result.bundle) return null;
  return result.bundle;
}
