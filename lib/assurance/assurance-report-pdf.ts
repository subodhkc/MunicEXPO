/**
 * AA-RENDERER-2: Flagship Assurance PDF renderer.
 *
 * Consumes the canonical Assurance Evidence Bundle through the report
 * profile projection layer and emits a PDF artifact. The renderer does not
 * recompute U5, rerun analyzers, or reinterpret evidence.
 *
 * Invariants:
 *   PDF != TRUTH_ENGINE
 *   PROFILE != EVIDENCE_STATE
 *   SAME_BUNDLE => SAME_SEMANTIC_STATE
 */

import { generatePDF, type PDFGenerationResult } from '@/lib/reports/exporters/pdf-generator';
import { buildAssurancePdfHtml, type AssuranceReportProfile } from './report-profile-projection';
import type { AssuranceEvidenceBundleV1 } from './reporting-projection-bundle';
import type { PDFExportOptions } from '@/lib/reports/base/report-types';

export interface AssurancePdfOptions {
  pageSize?: 'A4' | 'Letter';
  includeHeaders?: boolean;
  includeFooters?: boolean;
}

/**
 * Build the HTML consumed by the PDF renderer. This is a pure function and
 * is the testable seam for PDF semantic parity.
 */
export function buildAssurancePdfDocument(bundle: AssuranceEvidenceBundleV1, profile: AssuranceReportProfile = 'executive'): string {
  return buildAssurancePdfHtml(bundle, profile);
}

/**
 * Generate the flagship Assurance PDF from the canonical bundle.
 * Returns a bounded error object on renderer failure.
 */
export async function generateAssurancePdf(
  bundle: AssuranceEvidenceBundleV1,
  profile: AssuranceReportProfile = 'executive',
  options: AssurancePdfOptions = {},
): Promise<PDFGenerationResult> {
  const html = buildAssurancePdfDocument(bundle, profile);
  const pdfOptions: PDFExportOptions = {
    pageSize: (options.pageSize ?? 'A4').toLowerCase() as 'a4' | 'letter',
    orientation: 'portrait',
    margins: { top: 20, right: 15, bottom: 20, left: 15 },
    includePageNumbers: true,
    includeHeaders: options.includeHeaders ?? true,
    includeFooters: options.includeFooters ?? true,
  };
  return generatePDF(html, pdfOptions);
}
