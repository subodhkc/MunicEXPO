/**
 * AA-RENDERER-2: Report profile projection.
 *
 * A thin pure layer between the canonical Assurance Evidence Bundle and
 * audience-specific renderers. Profiles choose what to show and how to
 * word it; they never reinterpret evidence or compute assurance.
 *
 * Invariants:
 *   PROFILE = WHAT_TO_SHOW
 *   BUNDLE = WHAT_IS_TRUE
 *   PROFILE != INTERPRETATION_ENGINE
 *   RENDERER != TRUTH_ENGINE
 *   DISPLAY_ELIGIBILITY != EVIDENCE_STATE
 */

import type { AssuranceEvidenceBundleV1, EvidenceAuthorityState, EvidenceActionPath } from './reporting-projection-bundle';
import type { ArtifactManifest } from './assurance-artifact-manifest';

export type AssuranceReportProfile = 'executive' | 'technical' | 'auditor' | 'machine';

export interface AssuranceReportSection {
  key: string;
  title: string;
  summary: string;
  state?: EvidenceAuthorityState;
  items?: string[];
  limitations?: string[];
  evidenceRefs?: string[];
  actionPathRefs?: string[];
}

export interface AssuranceReportProfileProjection {
  profile: AssuranceReportProfile;
  evaluationIdentity: AssuranceEvidenceBundleV1['evaluationIdentity'];
  bundleDigest: string;
  disposition: AssuranceEvidenceBundleV1['disposition'];
  dispositionSource: AssuranceEvidenceBundleV1['dispositionSource'];
  dispositionAvailability: AssuranceEvidenceBundleV1['dispositionAvailability'];
  methodologyVersion?: string;
  sections: AssuranceReportSection[];
  limitations: string[];
}

/** Deterministic customer-facing labels for bounded states. */
const STATE_LABEL: Record<EvidenceAuthorityState, string> = {
  ESTABLISHED: 'Established',
  PARTIAL: 'Partially established',
  UNKNOWN: 'Unknown',
  NOT_ASSESSED: 'Not assessed',
  UNSUPPORTED: 'Unsupported',
  NOT_APPLICABLE: 'Not applicable',
};

function dispositionBasis(bundle: AssuranceEvidenceBundleV1): string {
  if (bundle.dispositionAvailability === 'BOUND') {
    return `Canonical U5 disposition bound to evaluation ${bundle.evaluationIdentity.evaluationId}.`;
  }
  return 'No completed canonical U5 disposition is bound to this bundle. That is not a pass.';
}

function summarizePlanes(paths: EvidenceActionPath[]): string {
  if (paths.length === 0) return 'No action paths were evaluated in this bundle.';
  const counts = paths.reduce<Record<string, number>>((acc, p) => {
    for (const [plane, state] of Object.entries(p.planes)) {
      acc[`${plane}:${state}`] = (acc[`${plane}:${state}`] ?? 0) + 1;
    }
    return acc;
  }, {});
  return Object.entries(counts).map(([k, n]) => `${n} path(s) ${k.split(':')[1].toLowerCase().replace(/_/g, ' ')} on ${k.split(':')[0]}`).join('; ');
}

function frontierSummary(bundle: AssuranceEvidenceBundleV1): string {
  const total = bundle.evidenceFrontier.length;
  const byState = bundle.evidenceFrontier.reduce<Record<string, number>>((acc, f) => {
    acc[f.state] = (acc[f.state] ?? 0) + 1;
    return acc;
  }, {});
  return `${total} frontier item(s): ${Object.entries(byState).map(([s, n]) => `${n} ${s.toLowerCase().replace(/_/g, ' ')}`).join(', ') || 'none'}.`;
}

function requiredActions(bundle: AssuranceEvidenceBundleV1): string[] {
  const actions: string[] = [];
  for (const f of bundle.evidenceFrontier) {
    if (f.state === 'NOT_ASSESSED' || f.state === 'UNKNOWN') {
      actions.push(`Provide or capture evidence for ${f.facet}:${f.subjectId} before relying on this surface.`);
    } else if (f.state === 'UNSUPPORTED') {
      actions.push(`Resolve unsupported analyzer/language coverage for ${f.facet}:${f.subjectId}.`);
    }
  }
  for (const p of bundle.actionPaths) {
    if (p.planes.codeCapable === 'ESTABLISHED' && p.planes.effectivelyGranted === 'NOT_ASSESSED') {
      actions.push(`Provide effective-provider evidence for action path ${p.pathId} before treating execution as authorized.`);
    }
    if (p.planes.codeCapable === 'ESTABLISHED' && p.planes.observed === 'NOT_ASSESSED') {
      actions.push(`Capture runtime evidence for action path ${p.pathId} before claiming observation.`);
    }
  }
  return actions.length > 0 ? actions : ['No deterministic required actions are established by this bundle.'];
}

function pathSummary(p: EvidenceActionPath): string {
  const parts = [p.toolCandidateId, p.handlerRef].filter(Boolean).join(' → ');
  return `${parts || 'Unnamed path'} — code capable ${p.planes.codeCapable.toLowerCase().replace(/_/g, ' ')}, requested ${p.planes.requested.toLowerCase().replace(/_/g, ' ')}, observed ${p.planes.observed.toLowerCase().replace(/_/g, ' ')}.`;
}

export function projectAssuranceReportProfile(
  bundle: AssuranceEvidenceBundleV1,
  profile: AssuranceReportProfile,
): AssuranceReportProfileProjection {
  const sections: AssuranceReportSection[] = [
    {
      key: 'decision',
      title: 'Assurance Decision',
      summary: `${bundle.disposition}${bundle.dispositionAvailability === 'BOUND' ? ' — bounded to the evaluated scope and available evidence.' : ' — no bound disposition is available.'}`,
      state: bundle.disposition === 'ALLOW' ? 'ESTABLISHED' : bundle.disposition === 'BLOCK' ? 'PARTIAL' : 'UNKNOWN',
      limitations: bundle.dispositionLimitations,
    },
    {
      key: 'decisionBasis',
      title: 'Decision Basis',
      summary: dispositionBasis(bundle),
      items: bundle.actionAssurance.limitations.length > 0 ? bundle.actionAssurance.limitations : ['Action Assurance limitations are not separately bound.'],
    },
    {
      key: 'actionAssurance',
      title: 'Action Assurance',
      summary: `Availability: ${bundle.actionAssurance.availability.toLowerCase().replace(/_/g, ' ')}. ${bundle.actionAssurance.frontierCount} frontier surface(s).`,
      limitations: bundle.actionAssurance.limitations,
    },
    {
      key: 'fivePlanes',
      title: 'Five Authority / Action Planes',
      summary: summarizePlanes(bundle.actionPaths),
      items: bundle.actionPaths.map((p) => `Path ${p.pathId}: requested ${STATE_LABEL[p.planes.requested]}, authorized ${STATE_LABEL[p.planes.policyAuthorized]}, granted ${STATE_LABEL[p.planes.effectivelyGranted]}, capable ${STATE_LABEL[p.planes.codeCapable]}, observed ${STATE_LABEL[p.planes.observed]}`),
      actionPathRefs: bundle.actionPaths.map((p) => p.pathId),
    },
    {
      key: 'materialMismatch',
      title: 'Material Mismatch / Consequence',
      summary: bundle.actionPaths.some((p) => p.planes.codeCapable === 'ESTABLISHED' && (p.planes.effectivelyGranted === 'NOT_ASSESSED' || p.planes.policyAuthorized === 'NOT_ASSESSED'))
        ? 'At least one action path has established code capability without established effective/provider authority.'
        : 'No established code-capable path without established authority is present in this bundle.',
      items: bundle.actionPaths
        .filter((p) => p.planes.codeCapable === 'ESTABLISHED' && (p.planes.effectivelyGranted === 'NOT_ASSESSED' || p.planes.policyAuthorized === 'NOT_ASSESSED'))
        .map((p) => `Path ${p.pathId}: code capability established; effective authority ${STATE_LABEL[p.planes.effectivelyGranted].toLowerCase()}; policy authority ${STATE_LABEL[p.planes.policyAuthorized].toLowerCase()}.`),
    },
    {
      key: 'requiredAction',
      title: 'Required Action',
      summary: 'Deterministic next actions derived from the evidence frontier and bounded plane states.',
      items: requiredActions(bundle),
    },
    {
      key: 'evidenceCoverage',
      title: 'Evidence Coverage & Frontier',
      summary: frontierSummary(bundle),
      items: bundle.evidenceFrontier.map((f) => `${f.facet}:${f.subjectId} — ${STATE_LABEL[f.state]} (${f.reasonCode})`),
      evidenceRefs: bundle.evidenceReferences.flatMap((r) => r.evidenceRefs),
      limitations: bundle.evaluationIntegrity.analysisLimitations,
    },
    {
      key: 'selectedPaths',
      title: 'Selected Consequential Paths',
      summary: `${bundle.actionPaths.length} action path(s) are included in this bundle.`,
      items: bundle.actionPaths.map(pathSummary),
      actionPathRefs: bundle.actionPaths.map((p) => p.pathId),
    },
    {
      key: 'constellation',
      title: 'System Constellation',
      summary: `Projection anchors: topology ${bundle.constellationAnchors.topologyProjectionDigest ? 'bound' : 'not bound'}, reachability ${bundle.constellationAnchors.reachabilityDigest ? 'bound' : 'not bound'}, constellation ${bundle.constellationAnchors.constellationDigest ? 'bound' : 'not bound'}.`,
    },
  ];

  if (profile === 'technical' || profile === 'auditor' || profile === 'machine') {
    sections.push({
      key: 'technicalAnnex',
      title: 'Technical / Standards Annex',
      summary: 'Canonical evidence references, evaluation integrity, and projection provenance.',
      items: [
        `Producer completion: ${bundle.evaluationIntegrity.producerCompletion}`,
        `Source truncation: ${bundle.evaluationIntegrity.sourceTruncationState}`,
        `Graph truncation: ${bundle.evaluationIntegrity.graphTruncationState}`,
        `Freshness: ${bundle.evaluationIntegrity.freshnessState}`,
        `Unsupported analyzers: ${bundle.evaluationIntegrity.unsupportedAnalyzers.join(', ') || 'none'}`,
        `Not-assessed analyzers: ${bundle.evaluationIntegrity.notAssessedAnalyzers.join(', ') || 'none'}`,
        `Bundle digest: ${bundle.bundleDigest}`,
      ],
      evidenceRefs: bundle.evidenceReferences.flatMap((r) => r.evidenceRefs),
      limitations: bundle.limitations,
    });
  }

  return {
    profile,
    evaluationIdentity: bundle.evaluationIdentity,
    bundleDigest: bundle.bundleDigest,
    disposition: bundle.disposition,
    dispositionSource: bundle.dispositionSource,
    dispositionAvailability: bundle.dispositionAvailability,
    methodologyVersion: bundle.dispositionMethodologyVersion,
    sections,
    limitations: bundle.limitations,
  };
}

/**
 * Machine-readable bundle projection.
 *
 * This artifact is DERIVED_FROM_EVIDENCE_BUNDLE: its bytes are a deterministic
 * projection of AssuranceEvidenceBundleV1 plus the artifact manifest identity.
 */
export interface MachineBundleProjection {
  schemaVersion: 'assurance-machine-projection-1.0.0';
  evaluationIdentity: AssuranceEvidenceBundleV1['evaluationIdentity'];
  evaluationSnapshotAt: string | null;
  buildProvenance: {
    outputGeneratorBuildIdentity: { commitSha: string; commitRef: string; packageVersion: string };
    analyzerBuildIdentity: { available: boolean; reason: string; captureState: string };
  };
  disposition: AssuranceEvidenceBundleV1['disposition'];
  dispositionSource: AssuranceEvidenceBundleV1['dispositionSource'];
  dispositionAvailability: AssuranceEvidenceBundleV1['dispositionAvailability'];
  dispositionMethodologyVersion?: string;
  actionAssurance: AssuranceEvidenceBundleV1['actionAssurance'];
  actionProof: AssuranceEvidenceBundleV1['actionProof'];
  reachability: AssuranceEvidenceBundleV1['reachability'];
  actionPaths: AssuranceEvidenceBundleV1['actionPaths'];
  evidenceReferences: AssuranceEvidenceBundleV1['evidenceReferences'];
  evidenceFrontier: AssuranceEvidenceBundleV1['evidenceFrontier'];
  evaluationIntegrity: AssuranceEvidenceBundleV1['evaluationIntegrity'];
  materialChange: AssuranceEvidenceBundleV1['materialChange'];
  constellationAnchors: AssuranceEvidenceBundleV1['constellationAnchors'];
  limitations: string[];
  bundleDigest: string;
  artifactManifest: Pick<ArtifactManifest, 'evaluationId' | 'scanId' | 'repositoryCommit' | 'evaluationSnapshotAt'>;
}

export function buildMachineBundleProjection(bundle: AssuranceEvidenceBundleV1, artifactManifest: Pick<ArtifactManifest, 'evaluationId' | 'scanId' | 'repositoryCommit' | 'evaluationSnapshotAt'>): MachineBundleProjection {
  return {
    schemaVersion: 'assurance-machine-projection-1.0.0',
    evaluationIdentity: bundle.evaluationIdentity,
    evaluationSnapshotAt: bundle.evaluationIdentity.evaluationSnapshotAt ?? null,
    buildProvenance: bundle.buildProvenance,
    disposition: bundle.disposition,
    dispositionSource: bundle.dispositionSource,
    dispositionAvailability: bundle.dispositionAvailability,
    dispositionMethodologyVersion: bundle.dispositionMethodologyVersion,
    actionAssurance: bundle.actionAssurance,
    actionProof: bundle.actionProof,
    reachability: bundle.reachability,
    actionPaths: bundle.actionPaths,
    evidenceReferences: bundle.evidenceReferences,
    evidenceFrontier: bundle.evidenceFrontier,
    evaluationIntegrity: bundle.evaluationIntegrity,
    materialChange: bundle.materialChange,
    constellationAnchors: bundle.constellationAnchors,
    limitations: bundle.limitations,
    bundleDigest: bundle.bundleDigest,
    artifactManifest,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sectionHtml(section: AssuranceReportSection): string {
  const items = section.items?.length ? `<ul>${section.items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : '';
  const limitations = section.limitations?.length ? `<p class="limitations">Limitations: ${section.limitations.map(escapeHtml).join('; ')}</p>` : '';
  return `<section class="section"><h2>${escapeHtml(section.title)}</h2><p>${escapeHtml(section.summary)}</p>${items}${limitations}</section>`;
}

/**
 * Build the flagship Assurance PDF HTML from a profile projection.
 * This is the HTML that the PDF renderer consumes; it is a pure projection.
 */
export function buildAssurancePdfHtml(bundle: AssuranceEvidenceBundleV1, profile: AssuranceReportProfile = 'executive'): string {
  const projection = projectAssuranceReportProfile(bundle, profile);
  const decisionClass = projection.disposition === 'ALLOW' ? 'allow' : projection.disposition === 'BLOCK' ? 'block' : 'review';
  return `<!doctype html><html><head><meta charset="utf-8"><title>HAIEC Assurance Report</title><style>
    body{font-family:system-ui,-apple-system,sans-serif;color:#0f172a;margin:0;padding:24px}
    .banner{border-bottom:2px solid #0f172a;padding-bottom:16px;margin-bottom:24px}
    .decision{font-size:28px;font-weight:700;text-transform:uppercase}
    .decision.allow{color:#065f46}.decision.block{color:#991b1b}.decision.review{color:#92400e}
    .section{margin-bottom:20px;page-break-inside:avoid}
    h2{font-size:14px;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #cbd5e1;padding-bottom:6px}
    ul{margin:8px 0;padding-left:20px}
    .limitations{font-size:11px;color:#475569;font-style:italic}
    .mono{font-family:monospace;font-size:10px}
    table{width:100%;border-collapse:collapse;font-size:11px}
    th,td{border:1px solid #cbd5e1;padding:6px;text-align:left;vertical-align:top}
    th{background:#f8fafc}
  </style></head><body>
    <div class="banner">
      <div class="mono">HAIEC · ${escapeHtml(projection.profile.toUpperCase())} PROFILE</div>
      <div class="decision ${decisionClass}">${escapeHtml(projection.disposition)}</div>
      <p>${escapeHtml(projection.evaluationIdentity.aiSystemId)} · Evaluation ${escapeHtml(projection.evaluationIdentity.evaluationId)} · ${escapeHtml(projection.evaluationIdentity.evaluationSnapshotAt ?? 'snapshot not bound')}</p>
      <p class="mono">Bundle: ${escapeHtml(projection.bundleDigest.slice(0, 16))}…</p>
    </div>
    ${projection.sections.map(sectionHtml).join('')}
  </body></html>`;
}
