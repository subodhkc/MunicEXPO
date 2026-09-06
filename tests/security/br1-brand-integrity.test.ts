/**
 * BR1 — Brand Integrity Tests
 *
 * Validates that active brand surfaces contain the canonical HAIEC identity
 * and do NOT contain the obsolete full form or "HAIEC Inc." in general brand language.
 *
 * These tests target ACTIVE surfaces only — they do NOT grep the entire repo.
 * Historical artifacts, archives, and test fixtures are intentionally excluded.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const cwd = process.cwd();

function readActiveFile(relPath: string): string {
  return fs.readFileSync(path.join(cwd, relPath), 'utf-8');
}

// Active brand surface files (NOT archives, NOT test fixtures, NOT historical artifacts)
const ACTIVE_BRAND_SURFACES = [
  'app/layout.tsx',
  'app/about/page.tsx',
  'app/what-is-haiec/page.tsx',
  'app/what-is-haiec/layout.tsx',
  'app/research/page.tsx',
  'app/research/metadata.ts',
  'app/landing/page.tsx',
  'app/login/page.tsx',
  'app/sitemap/page.tsx',
  'app/careers/page.tsx',
  'app/careers/[slug]/layout.tsx',
  'app/refund-policy/page.tsx',
  'app/resources/framework-comparison/layout.tsx',
  'components/Footer.tsx',
  'components/StructuredData.tsx',
  'components/SEOHead.tsx',
  'components/AutoHideNavigation.tsx',
  'lib/email/resend-templates.tsx',
  'lib/email/resend.ts',
  'public/.well-known/haiec-authority.json',
];

// Active metadata / structured-data files
const ACTIVE_METADATA_FILES = [
  'app/layout.tsx',
  'app/what-is-haiec/layout.tsx',
  'app/research/metadata.ts',
  'components/StructuredData.tsx',
  'components/SEOHead.tsx',
  'public/.well-known/haiec-authority.json',
];

// Active email / transactional template files
const ACTIVE_EMAIL_FILES = [
  'lib/email/resend-templates.tsx',
  'lib/email/resend.ts',
  'app/api/assessment/reminder/route.ts',
  'app/api/assessment/share-email/route.ts',
];

// Active report template files (generate future outputs)
const ACTIVE_REPORT_TEMPLATES = [
  'lib/iso27001/soa-template.ts',
  'lib/iso27001/risk-assessment-template.ts',
  'lib/iso27001/evidence-package-template.ts',
  'lib/iso27001/audit-report-template.ts',
  'lib/hipaa/risk-assessment-template.ts',
  'lib/hipaa/policies-procedures-template.ts',
  'lib/hipaa/breach-notification-template.ts',
  'lib/hipaa/baa-template.ts',
  'lib/gdpr/dpia-template.ts',
  'lib/gdpr/breach-notification-template.ts',
  'lib/gdpr/dpa-template.ts',
  'lib/gdpr/ropa-template.ts',
  'lib/colorado/model-card-template.ts',
  'lib/colorado/impact-assessment-template.ts',
  'lib/colorado/dataset-card-template.ts',
  'lib/colorado/consumer-disclosure-template.ts',
  'lib/eu-ai-act/templates/base-report-template.html',
];

// Legal pages that may have used "HAIEC Inc." — now reviewed and changed to just "HAIEC"
const LEGAL_ENTITY_REVIEW_FILES = [
  'app/terms/page.tsx',
  'app/privacy/page.tsx',
  'app/legal/dpa/page.tsx',
];

// ─── A. Old full form removed from active surfaces ──────────────────────────

describe('[BR1] Old full form removed from active brand surfaces', () => {
  for (const file of ACTIVE_BRAND_SURFACES) {
    it(`${file} does not contain "Holistic AI Ethics"`, () => {
      const content = readActiveFile(file);
      expect(content).not.toMatch(/Holistic AI Ethics/i);
    });
  }
});

// ─── B. "HAIEC Inc." not in general brand surfaces ──────────────────────────

describe('[BR1] "HAIEC Inc." not in general brand surfaces', () => {
  for (const file of ACTIVE_BRAND_SURFACES) {
    it(`${file} does not contain "HAIEC Inc"`, () => {
      const content = readActiveFile(file);
      expect(content).not.toMatch(/HAIEC\s+Inc/i);
    });
  }
});

// ─── C. Master entity name remains HAIEC ────────────────────────────────────

describe('[BR1] Master entity name remains HAIEC', () => {
  it('StructuredData Organization name is HAIEC', () => {
    const content = readActiveFile('components/StructuredData.tsx');
    expect(content).toMatch(/name:\s*['"]HAIEC['"]/);
  });

  it('StructuredData does not set name to company descriptor', () => {
    const content = readActiveFile('components/StructuredData.tsx');
    expect(content).not.toMatch(/name:\s*['"]Human AI Evidence Company['"]/);
  });

  it('StructuredData does not set name to tagline', () => {
    const content = readActiveFile('components/StructuredData.tsx');
    expect(content).not.toMatch(/name:\s*['"]High Assurance In Every Consequence['"]/i);
  });

  it('StructuredData has alternateName as company descriptor', () => {
    const content = readActiveFile('components/StructuredData.tsx');
    expect(content).toMatch(/alternateName:\s*['"]Human AI Evidence Company['"]/);
  });

  it('StructuredData has slogan as tagline', () => {
    const content = readActiveFile('components/StructuredData.tsx');
    expect(content).toMatch(/slogan:\s*['"]High assurance in every consequence\.['"]/i);
  });

  it('StructuredData alternateName is NOT the tagline', () => {
    const content = readActiveFile('components/StructuredData.tsx');
    expect(content).not.toMatch(/alternateName:\s*['"]High Assurance In Every Consequence['"]/i);
  });

  it('layout.tsx authors/creator/publisher is HAIEC', () => {
    const content = readActiveFile('app/layout.tsx');
    expect(content).toMatch(/authors:\s*\[\{\s*name:\s*['"]HAIEC['"]\s*\}\]/);
    expect(content).toMatch(/creator:\s*['"]HAIEC['"]/);
    expect(content).toMatch(/publisher:\s*['"]HAIEC['"]/);
  });

  it('well-known authority JSON has correct full_name and tagline', () => {
    const content = readActiveFile('public/.well-known/haiec-authority.json');
    const json = JSON.parse(content);
    expect(json.organization.name).toBe('HAIEC');
    expect(json.organization.full_name).toBe('Human AI Evidence Company');
    expect(json.organization.tagline).toBe('High assurance in every consequence.');
  });
});

// ─── D. Company descriptor and tagline present in canonical surfaces ────────

describe('[BR1] Company descriptor and tagline present in canonical brand surfaces', () => {
  it('About page contains "Human AI Evidence Company"', () => {
    const content = readActiveFile('app/about/page.tsx');
    expect(content).toContain('Human AI Evidence Company');
  });

  it('About page does not present tagline as company expansion', () => {
    const content = readActiveFile('app/about/page.tsx');
    // LOCK: TAGLINE != FULL_FORM
    expect(content).not.toMatch(/HAIEC\s*\(High Assurance In Every Consequence\)/i);
  });

  it('What-is-haiec page contains "Human AI Evidence Company"', () => {
    const content = readActiveFile('app/what-is-haiec/page.tsx');
    expect(content).toContain('Human AI Evidence Company');
  });

  it('What-is-haiec page does not say "HAIEC stands for High Assurance"', () => {
    const content = readActiveFile('app/what-is-haiec/page.tsx');
    // LOCK: TAGLINE != FULL_FORM
    expect(content).not.toMatch(/HAIEC stands for.*High Assurance/i);
  });

  it('What-is-haiec metadata contains evidence-bound assurance description', () => {
    const content = readActiveFile('app/what-is-haiec/layout.tsx');
    expect(content).toContain('HAIEC provides evidence-bound assurance');
  });

  it('Footer contains tagline "High assurance in every consequence"', () => {
    const content = readActiveFile('components/Footer.tsx');
    expect(content).toMatch(/High assurance in every consequence/i);
  });
});

// ─── E. Research page contains core thesis ──────────────────────────────────

describe('[BR1] Research page contains core thesis and current/future separation', () => {
  const researchContent = readActiveFile('app/research/page.tsx');

  it('contains "Permission is not delegation"', () => {
    expect(researchContent).toContain('Permission is not delegation');
  });

  it('contains "AI Action Assurance" research territory', () => {
    expect(researchContent).toContain('AI Action Assurance');
  });

  it('contains CURRENT PLATFORM section', () => {
    expect(researchContent).toMatch(/CURRENT PLATFORM/i);
  });

  it('contains ACTIVE RESEARCH section', () => {
    expect(researchContent).toMatch(/ACTIVE RESEARCH/i);
  });

  it('contains brand thesis line', () => {
    expect(researchContent).toContain('Consequential actions require assurance');
  });

  it('distinguishes research from current product', () => {
    expect(researchContent).toMatch(/not currently deployed production functionality/i);
    expect(researchContent).toMatch(/research and future direction/i);
  });
});

// ─── F. Report templates updated ────────────────────────────────────────────

describe('[BR1] Active report templates use HAIEC (not old full form)', () => {
  for (const file of ACTIVE_REPORT_TEMPLATES) {
    it(`${file} does not contain "Holistic AI Ethics"`, () => {
      const content = readActiveFile(file);
      expect(content).not.toMatch(/Holistic AI Ethics/i);
    });
  }
});

// ─── G. Email templates updated ─────────────────────────────────────────────

describe('[BR1] Active email templates use HAIEC (not old full form)', () => {
  for (const file of ACTIVE_EMAIL_FILES) {
    it(`${file} does not contain "Holistic AI Ethics"`, () => {
      const content = readActiveFile(file);
      expect(content).not.toMatch(/Holistic AI Ethics/i);
    });
  }
});

// ─── H. Legal entity text no longer uses "HAIEC Inc." ───────────────────────

describe('[BR1] Legal entity text uses "HAIEC" not "HAIEC Inc."', () => {
  for (const file of LEGAL_ENTITY_REVIEW_FILES) {
    it(`${file} does not contain "HAIEC Inc"`, () => {
      const content = readActiveFile(file);
      // Brand direction: use "HAIEC" (not "HAIEC Inc.") even in legal pages
      expect(content).not.toMatch(/HAIEC\s+Inc/i);
    });
  }
});

// ─── I. Brand copy guardrails — no overclaims ───────────────────────────────

describe('[BR1] Brand copy guardrails — no new overclaims', () => {
  const overclaimPatterns = [
    /proves delegation/i,
    /guarantees safe action/i,
    /secures every AI action/i,
    /fully self-hosted HAIEC/i,
    /AI certified/i,
    /compliance certified/i,
    /all consequences verified/i,
    /cryptographically proves evidence is true/i,
  ];

  const guardrailFiles = [
    'app/about/page.tsx',
    'app/what-is-haiec/page.tsx',
    'app/research/page.tsx',
    'app/landing/page.tsx',
  ];

  for (const file of guardrailFiles) {
    it(`${file} does not contain overclaims`, () => {
      const content = readActiveFile(file);
      for (const pattern of overclaimPatterns) {
        expect(content).not.toMatch(pattern);
      }
    });
  }
});

// ─── J. Canonical brand document exists ─────────────────────────────────────

describe('[BR1] Canonical brand document exists', () => {
  it('docs/brand/HAIEC-BRAND-IDENTITY.md exists', () => {
    expect(fs.existsSync(path.join(cwd, 'docs/brand/HAIEC-BRAND-IDENTITY.md'))).toBe(true);
  });

  it('brand document contains master brand, descriptor, tagline, and thesis', () => {
    const content = readActiveFile('docs/brand/HAIEC-BRAND-IDENTITY.md');
    expect(content).toContain('HAIEC');
    expect(content).toContain('Human AI Evidence Company');
    expect(content).toMatch(/High assurance in every consequence/i);
    expect(content).toContain('Permission is not delegation');
    expect(content).toContain('AI Action Assurance');
  });

  it('brand document distinguishes descriptor from tagline', () => {
    const content = readActiveFile('docs/brand/HAIEC-BRAND-IDENTITY.md');
    // LOCK: TAGLINE != FULL_FORM, BRAND_NAME != LEGAL_ENTITY
    expect(content).toContain('Company Descriptor');
    expect(content).toContain('Tagline');
    expect(content).toContain('TAGLINE != FULL_FORM');
    expect(content).toContain('BRAND_NAME != REGISTERED_LEGAL_ENTITY');
  });

  it('external brand rollout inventory exists', () => {
    expect(fs.existsSync(path.join(cwd, 'docs/brand/EXTERNAL-BRAND-ROLLOUT-INVENTORY.md'))).toBe(true);
  });
});
