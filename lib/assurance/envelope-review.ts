/**
 * UX-2C — Operating Envelope Review Utilities
 *
 * Provides:
 *   - Human-readable constraint summaries (no raw JSON required for approval)
 *   - Semantic diff between DRAFT and currently APPROVED envelope
 *   - Deterministic classification of authority changes
 *
 * LOCK: STORED_POLICY_CONSTRAINT != MACHINE_EVALUABLE_CONSTRAINT
 * LOCK: APPROVAL_REQUIREMENT_DECLARED != APPROVAL_CONTROL_OBSERVED
 * LOCK: NO_CONTRADICTION != PROVEN_SATISFIED
 *
 * This module does NOT:
 *   - compute a numerical "risk score"
 *   - claim HAIEC enforces anything
 *   - alter U5/U6 semantics
 *   - create a new evidence/policy store
 */

import {
  OperatingEnvelope,
  OperatingEnvelopeConstraints,
  ApprovalRequirement,
} from './types';

// ─── Human-Readable Constraint Summary ───────────────────────────────────────

export interface ConstraintSummarySection {
  /** Human-readable section title (e.g., "Actions", "Scope", "Limits") */
  title: string;
  /** Human-readable items in this section */
  items: string[];
  /** True if this section has no constraints (empty) */
  empty: boolean;
}

export interface ConstraintSummary {
  sections: ConstraintSummarySection[];
}

/**
 * Build a human-readable summary of envelope constraints.
 * Grouped into understandable sections — no internal field names as primary language.
 */
export function summarizeConstraintsForReview(
  constraints: OperatingEnvelopeConstraints,
): ConstraintSummary {
  const sections: ConstraintSummarySection[] = [];

  // Actions
  sections.push({
    title: 'Actions',
    items: constraints.allowedOperations.length > 0
      ? [...constraints.allowedOperations].sort()
      : [],
    empty: constraints.allowedOperations.length === 0,
  });

  // Scope
  sections.push({
    title: 'Scope',
    items: constraints.resourceScopes.length > 0
      ? [...constraints.resourceScopes].sort()
      : [],
    empty: constraints.resourceScopes.length === 0,
  });

  // Limits
  const limitItems: string[] = [];
  if (constraints.maxTargetCount !== undefined) {
    limitItems.push(`Max targets per action: ${constraints.maxTargetCount}`);
  }
  if (constraints.maxChangeMagnitude !== undefined) {
    limitItems.push(`Max change magnitude: ${constraints.maxChangeMagnitude}`);
  }
  sections.push({
    title: 'Limits',
    items: limitItems,
    empty: limitItems.length === 0,
  });

  // Data
  const dataItems: string[] = [];
  if (constraints.dataClasses.length > 0) {
    dataItems.push('Allowed data classes: ' + [...constraints.dataClasses].sort().join(', '));
  }
  if (constraints.prohibitedDataClasses && constraints.prohibitedDataClasses.length > 0) {
    dataItems.push('Prohibited data classes: ' + [...constraints.prohibitedDataClasses].sort().join(', '));
  }
  sections.push({
    title: 'Data',
    items: dataItems,
    empty: dataItems.length === 0,
  });

  // Tools & Models
  const toolItems: string[] = [];
  if (constraints.approvedModels.length > 0) {
    toolItems.push('Approved models: ' + [...constraints.approvedModels].sort().join(', '));
  }
  if (constraints.approvedTools.length > 0) {
    toolItems.push('Approved tools: ' + [...constraints.approvedTools].sort().join(', '));
  }
  sections.push({
    title: 'Tools & Models',
    items: toolItems,
    empty: toolItems.length === 0,
  });

  // Destinations & Regions
  const destItems: string[] = [];
  if (constraints.destinations.length > 0) {
    destItems.push('Destinations: ' + [...constraints.destinations].sort().join(', '));
  }
  if (constraints.regions && constraints.regions.length > 0) {
    destItems.push('Regions: ' + [...constraints.regions].sort().join(', '));
  }
  if (constraints.r1Services && constraints.r1Services.length > 0) {
    destItems.push('R1 services: ' + [...constraints.r1Services].sort().join(', '));
  }
  sections.push({
    title: 'Destinations & Regions',
    items: destItems,
    empty: destItems.length === 0,
  });

  // Environments
  sections.push({
    title: 'Environments',
    items: constraints.allowedEnvironments.length > 0
      ? [...constraints.allowedEnvironments].sort()
      : [],
    empty: constraints.allowedEnvironments.length === 0,
  });

  // Human Approval
  const approvalItems: string[] = [];
  for (const req of constraints.approvalRequirements) {
    if (req.requiresApproval) {
      const role = req.approverRole ? ` (role: ${req.approverRole})` : '';
      approvalItems.push(`${req.operation} requires human approval${role}`);
    }
  }
  sections.push({
    title: 'Human Approval',
    items: approvalItems,
    empty: approvalItems.length === 0,
  });

  return { sections };
}

// ─── Semantic Diff ───────────────────────────────────────────────────────────

export type SemanticChangeType =
  | 'AUTHORITY_EXPANDED'
  | 'AUTHORITY_NARROWED'
  | 'LIMIT_INCREASED'
  | 'LIMIT_REDUCED'
  | 'APPROVAL_REQUIREMENT_ADDED'
  | 'APPROVAL_REQUIREMENT_REMOVED'
  | 'DATA_CLASS_ADDED'
  | 'DATA_CLASS_REMOVED'
  | 'PROHIBITED_DATA_CLASS_ADDED'
  | 'PROHIBITED_DATA_CLASS_REMOVED'
  | 'OTHER_POLICY_CHANGE';

export interface SemanticDiffEntry {
  changeType: SemanticChangeType;
  /** Human-readable description */
  description: string;
  /** The field that changed */
  field: string;
}

export interface SemanticDiffResult {
  entries: SemanticDiffEntry[];
  /** True if no semantic changes detected */
  noChanges: boolean;
  /** High-level classification */
  summary: 'AUTHORITY_EXPANDED' | 'AUTHORITY_NARROWED' | 'MIXED' | 'NO_CHANGE';
}

/**
 * Compute a semantic diff between a DRAFT and the currently APPROVED envelope.
 *
 * For first-ever v1 approval (no prior APPROVED), returns noChanges=true.
 *
 * Classification:
 *   - Added actions/scopes/tools/models/destinations/environments → AUTHORITY_EXPANDED
 *   - Removed actions/scopes/tools/models/destinations/environments → AUTHORITY_NARROWED
 *   - Increased limits → LIMIT_INCREASED
 *   - Decreased limits → LIMIT_REDUCED
 *   - Added approval requirements → APPROVAL_REQUIREMENT_ADDED
 *   - Removed approval requirements → APPROVAL_REQUIREMENT_REMOVED
 *
 * Does NOT invent a numerical risk score.
 * Uses deterministic language.
 */
export function computeSemanticDiff(
  draft: OperatingEnvelopeConstraints,
  approved: OperatingEnvelopeConstraints | null,
): SemanticDiffResult {
  if (!approved) {
    return { entries: [], noChanges: true, summary: 'NO_CHANGE' };
  }

  const entries: SemanticDiffEntry[] = [];
  let hasExpanded = false;
  let hasNarrowed = false;

  // Compare string arrays — added items = expanded, removed = narrowed
  const compareStringArray = (
    field: string,
    draftArr: string[],
    approvedArr: string[],
    label: string,
  ) => {
    const draftSet = new Set(draftArr.map(s => s.toLowerCase().trim()));
    const approvedSet = new Set(approvedArr.map(s => s.toLowerCase().trim()));
    const added = draftArr.filter(s => !approvedSet.has(s.toLowerCase().trim()));
    const removed = approvedArr.filter(s => !draftSet.has(s.toLowerCase().trim()));

    if (added.length > 0) {
      entries.push({
        changeType: 'AUTHORITY_EXPANDED',
        description: `${label} added: ${added.sort().join(', ')}`,
        field,
      });
      hasExpanded = true;
    }
    if (removed.length > 0) {
      entries.push({
        changeType: 'AUTHORITY_NARROWED',
        description: `${label} removed: ${removed.sort().join(', ')}`,
        field,
      });
      hasNarrowed = true;
    }
  };

  compareStringArray('allowedOperations', draft.allowedOperations, approved.allowedOperations, 'Action');
  compareStringArray('resourceScopes', draft.resourceScopes, approved.resourceScopes, 'Scope');
  compareStringArray('approvedModels', draft.approvedModels, approved.approvedModels, 'Model');
  compareStringArray('approvedTools', draft.approvedTools, approved.approvedTools, 'Tool');
  compareStringArray('destinations', draft.destinations, approved.destinations, 'Destination');
  compareStringArray('allowedEnvironments', draft.allowedEnvironments, approved.allowedEnvironments, 'Environment');
  if (draft.regions || approved.regions) {
    compareStringArray('regions', draft.regions ?? [], approved.regions ?? [], 'Region');
  }
  if (draft.r1Services || approved.r1Services) {
    compareStringArray('r1Services', draft.r1Services ?? [], approved.r1Services ?? [], 'R1 service');
  }

  // Compare data classes
  compareStringArray('dataClasses', draft.dataClasses, approved.dataClasses, 'Data class');

  // Compare prohibited data classes
  if (draft.prohibitedDataClasses || approved.prohibitedDataClasses) {
    const draftProhibited = new Set((draft.prohibitedDataClasses ?? []).map(s => s.toLowerCase().trim()));
    const approvedProhibited = new Set((approved.prohibitedDataClasses ?? []).map(s => s.toLowerCase().trim()));
    const addedProhibited = (draft.prohibitedDataClasses ?? []).filter(s => !approvedProhibited.has(s.toLowerCase().trim()));
    const removedProhibited = (approved.prohibitedDataClasses ?? []).filter(s => !draftProhibited.has(s.toLowerCase().trim()));

    if (addedProhibited.length > 0) {
      entries.push({
        changeType: 'PROHIBITED_DATA_CLASS_ADDED',
        description: `Prohibited data class added: ${addedProhibited.sort().join(', ')}`,
        field: 'prohibitedDataClasses',
      });
      // Adding a prohibition narrows authority
      hasNarrowed = true;
    }
    if (removedProhibited.length > 0) {
      entries.push({
        changeType: 'PROHIBITED_DATA_CLASS_REMOVED',
        description: `Prohibited data class removed: ${removedProhibited.sort().join(', ')}`,
        field: 'prohibitedDataClasses',
      });
      // Removing a prohibition expands authority
      hasExpanded = true;
    }
  }

  // Compare numeric limits
  if (draft.maxTargetCount !== undefined || approved.maxTargetCount !== undefined) {
    const draftVal = draft.maxTargetCount;
    const approvedVal = approved.maxTargetCount;
    if (draftVal !== approvedVal) {
      if (draftVal !== undefined && approvedVal !== undefined) {
        if (draftVal > approvedVal) {
          entries.push({
            changeType: 'LIMIT_INCREASED',
            description: `Max targets per action increased: ${approvedVal} → ${draftVal}`,
            field: 'maxTargetCount',
          });
          hasExpanded = true;
        } else {
          entries.push({
            changeType: 'LIMIT_REDUCED',
            description: `Max targets per action reduced: ${approvedVal} → ${draftVal}`,
            field: 'maxTargetCount',
          });
          hasNarrowed = true;
        }
      } else if (draftVal !== undefined && approvedVal === undefined) {
        entries.push({
          changeType: 'LIMIT_INCREASED',
          description: `Max targets per action set to ${draftVal} (was unspecified)`,
          field: 'maxTargetCount',
        });
        hasExpanded = true;
      } else if (draftVal === undefined && approvedVal !== undefined) {
        entries.push({
          changeType: 'LIMIT_REDUCED',
          description: `Max targets per action removed (was ${approvedVal})`,
          field: 'maxTargetCount',
        });
        hasNarrowed = true;
      }
    }
  }

  if (draft.maxChangeMagnitude !== undefined || approved.maxChangeMagnitude !== undefined) {
    const draftVal = draft.maxChangeMagnitude;
    const approvedVal = approved.maxChangeMagnitude;
    if (draftVal !== approvedVal) {
      if (draftVal !== undefined && approvedVal !== undefined) {
        if (draftVal > approvedVal) {
          entries.push({
            changeType: 'LIMIT_INCREASED',
            description: `Max change magnitude increased: ${approvedVal} → ${draftVal}`,
            field: 'maxChangeMagnitude',
          });
          hasExpanded = true;
        } else {
          entries.push({
            changeType: 'LIMIT_REDUCED',
            description: `Max change magnitude reduced: ${approvedVal} → ${draftVal}`,
            field: 'maxChangeMagnitude',
          });
          hasNarrowed = true;
        }
      } else if (draftVal !== undefined && approvedVal === undefined) {
        entries.push({
          changeType: 'LIMIT_INCREASED',
          description: `Max change magnitude set to ${draftVal} (was unspecified)`,
          field: 'maxChangeMagnitude',
        });
        hasExpanded = true;
      } else if (draftVal === undefined && approvedVal !== undefined) {
        entries.push({
          changeType: 'LIMIT_REDUCED',
          description: `Max change magnitude removed (was ${approvedVal})`,
          field: 'maxChangeMagnitude',
        });
        hasNarrowed = true;
      }
    }
  }

  // Compare approval requirements
  const draftApprovals = new Map(draft.approvalRequirements.filter(a => a.requiresApproval).map(a => [a.operation, a]));
  const approvedApprovals = new Map(approved.approvalRequirements.filter(a => a.requiresApproval).map(a => [a.operation, a]));

  for (const [op] of draftApprovals) {
    if (!approvedApprovals.has(op)) {
      entries.push({
        changeType: 'APPROVAL_REQUIREMENT_ADDED',
        description: `Human approval requirement added for: ${op}`,
        field: 'approvalRequirements',
      });
      // Adding approval requirements narrows authority (more friction)
      hasNarrowed = true;
    }
  }
  for (const [op] of approvedApprovals) {
    if (!draftApprovals.has(op)) {
      entries.push({
        changeType: 'APPROVAL_REQUIREMENT_REMOVED',
        description: `Human approval requirement removed for: ${op}`,
        field: 'approvalRequirements',
      });
      // Removing approval requirements expands authority (less friction)
      hasExpanded = true;
    }
  }

  const noChanges = entries.length === 0;
  const summary: SemanticDiffResult['summary'] = noChanges
    ? 'NO_CHANGE'
    : hasExpanded && hasNarrowed
      ? 'MIXED'
      : hasExpanded
        ? 'AUTHORITY_EXPANDED'
        : 'AUTHORITY_NARROWED';

  return { entries, noChanges, summary };
}

// ─── Human-Readable State Labels ─────────────────────────────────────────────

export function getEnvelopeStateLabel(state: string): {
  label: string;
  description: string;
  color: 'amber' | 'emerald' | 'slate' | 'red';
} {
  switch (state) {
    case 'DRAFT':
      return {
        label: 'Draft',
        description: 'Proposed policy, not active authority',
        color: 'amber',
      };
    case 'APPROVED':
      return {
        label: 'Approved policy',
        description: 'Current organizational operating boundary',
        color: 'emerald',
      };
    case 'SUPERSEDED':
      return {
        label: 'Superseded',
        description: 'Historical policy version; no longer current',
        color: 'slate',
      };
    case 'REVOKED':
      return {
        label: 'Revoked',
        description: 'No longer provides policy authorization in HAIEC',
        color: 'red',
      };
    default:
      return {
        label: state,
        description: 'Unknown state',
        color: 'slate',
      };
  }
}

// ─── Constraint Evaluability Classification ──────────────────────────────────

export type ConstraintEvaluabilityClass =
  | 'EVIDENCE_COMPARABLE'
  | 'LIMITED_EVIDENCE_COMPARISON'
  | 'RECORDED_POLICY_NOT_BEHAVIORALLY_EVALUATED';

export function getConstraintEvaluabilityLabel(
  evaluability: ConstraintEvaluabilityClass,
): string {
  switch (evaluability) {
    case 'EVIDENCE_COMPARABLE':
      return 'Evidence-comparable';
    case 'LIMITED_EVIDENCE_COMPARISON':
      return 'Limited evidence comparison';
    case 'RECORDED_POLICY_NOT_BEHAVIORALLY_EVALUATED':
      return 'Recorded policy — not currently behaviorally evaluated';
  }
}
