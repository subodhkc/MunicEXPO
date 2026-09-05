/**
 * UX0 — Public Website Design Guardrail Tests
 *
 * Validates that the canonical public design system is maintained.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const cwd = process.cwd();

function readActiveFile(relPath: string): string {
  return fs.readFileSync(path.join(cwd, relPath), 'utf-8');
}

// ─── A. No em dash in active metadata ───────────────────────────────────────

describe('[UX0] No em dash in active metadata', () => {
  const metadataFiles = [
    'app/layout.tsx',
    'app/about/page.tsx',
    'app/what-is-haiec/page.tsx',
    'app/what-is-haiec/metadata.ts',
    'app/research/metadata.ts',
    'app/pricing/metadata.ts',
    'app/sample-reports/metadata.ts',
    'app/frameworks/metadata.ts',
    'app/llmverify/layout.tsx',
    'app/ai-appsec/layout.tsx',
    'app/trust-artifacts/layout.tsx',
    'app/verify/layout.tsx',
    'app/products/runtime-security/layout.tsx',
  ];

  for (const file of metadataFiles) {
    it(`${file} has no em dash in metadata title/description`, () => {
      const fullPath = path.join(cwd, file);
      if (!fs.existsSync(fullPath)) return; // Skip non-existent files (deleted metadata.ts files)
      const content = readActiveFile(file);
      // Check title and description fields for em dash
      const titleMatches = content.match(/title:\s*['"`]([^'"`]*—[^'"`]*)['"`]/g);
      const descMatches = content.match(/description:\s*['"`]([^'"`]*—[^'"`]*)['"`]/g);
      const allMatches = [...(titleMatches || []), ...(descMatches || [])];
      expect(allMatches).toHaveLength(0);
    });
  }
});

// ─── B. DynamicCTA removed from header (consolidated into single Get Started control) ──

describe('[UX0] DynamicCTA removed from header', () => {
  it('DynamicCTA component file does not exist', () => {
    // DynamicCTA was removed and consolidated into the single Get Started/Account
    // control in AutoHideNavigation. The old standalone "Validate My AI" CTA
    // is no longer the global product CTA.
    const ctaPath = path.join(cwd, 'components/DynamicCTA.tsx');
    expect(fs.existsSync(ctaPath)).toBe(false);
  });

  it('AutoHideNavigation does not import DynamicCTA', () => {
    const content = readActiveFile('components/AutoHideNavigation.tsx');
    expect(content).not.toMatch(/DynamicCTA/);
  });

  it('AutoHideNavigation does not have standalone Validate My AI button', () => {
    const content = readActiveFile('components/AutoHideNavigation.tsx');
    expect(content).not.toMatch(/Validate My AI/);
  });
});

// ─── C. Design system CSS has no conflicting utilities ──────────────────────

describe('[UX0] Design system CSS conflicts removed', () => {
  it('haiec-design-system.css does not define .container', () => {
    const content = readActiveFile('styles/haiec-design-system.css');
    // Should not have a standalone .container rule (conflicts with Tailwind)
    expect(content).not.toMatch(/^\.container\s*\{/m);
  });

  it('haiec-design-system.css does not define .section', () => {
    const content = readActiveFile('styles/haiec-design-system.css');
    expect(content).not.toMatch(/^\.section\s*\{/m);
  });

  it('haiec-design-system.css does not define .flex', () => {
    const content = readActiveFile('styles/haiec-design-system.css');
    expect(content).not.toMatch(/^\.flex\s*\{/m);
  });

  it('haiec-design-system.css primary is forest green (shared product/dashboard theme, not changed by UX0)', () => {
    const content = readActiveFile('styles/haiec-design-system.css');
    // UX0-R1: reverted global --haiec-primary to forest green to preserve dashboard/product theme.
    // Public marketing pages use Tailwind emerald classes directly, not this CSS variable.
    expect(content).toMatch(/--haiec-primary:\s*#228B22/);
  });
});

// ─── D. Research page uses canonical colors ─────────────────────────────────

describe('[UX0] Research page uses canonical emerald/slate (not blue/purple)', () => {
  it('research page has no blue- or purple- classes', () => {
    const content = readActiveFile('app/research/page.tsx');
    expect(content).not.toMatch(/blue-/);
    expect(content).not.toMatch(/purple-/);
  });
});

// ─── E. ReleaseAnnouncement does not use violet gradient ─────────────────────

describe('[UX0] ReleaseAnnouncement uses emerald (not violet gradient)', () => {
  it('ReleaseAnnouncement has no violet or gradient', () => {
    const content = readActiveFile('components/ReleaseAnnouncement.tsx');
    expect(content).not.toMatch(/violet/);
    expect(content).not.toMatch(/gradient/);
  });
});

// ─── F. About page uses canonical colors ────────────────────────────────────

describe('[UX0] About page uses canonical colors (no decorative gradients)', () => {
  it('about page has no text gradient', () => {
    const content = readActiveFile('app/about/page.tsx');
    expect(content).not.toMatch(/bg-clip-text/);
    expect(content).not.toMatch(/from-emerald-400 to-cyan-400/);
  });

  it('about page hero uses bg-slate-900 (not gradient)', () => {
    const content = readActiveFile('app/about/page.tsx');
    expect(content).toMatch(/bg-slate-900/);
  });
});

// ─── G. What-is-haiec page uses canonical colors ────────────────────────────

describe('[UX0] What-is-haiec uses canonical colors', () => {
  it('what-is-haiec has no blue/purple/cyan decorative classes', () => {
    const content = readActiveFile('app/what-is-haiec/page.tsx');
    // Allow semantic blue in code blocks but not decorative card backgrounds
    const decorativeBlue = content.match(/bg-blue-50|text-blue-900|text-blue-800/g);
    expect(decorativeBlue).toBeNull();
    const decorativePurple = content.match(/bg-purple-50|text-purple-900|text-purple-800/g);
    expect(decorativePurple).toBeNull();
    const decorativeCyan = content.match(/bg-cyan-50|text-cyan-900|text-cyan-800/g);
    expect(decorativeCyan).toBeNull();
  });
});

// ─── H. Homepage uses canonical accent colors ───────────────────────────────

describe('[UX0] Homepage uses emerald/slate (not blue/purple decorative)', () => {
  it('homepage has no decorative purple classes', () => {
    const content = readActiveFile('app/page.tsx');
    // Purple should not appear as decorative icon/badge colors
    const decorativePurple = content.match(/bg-purple-500\/10|text-purple-500|border-purple-500/g);
    expect(decorativePurple).toBeNull();
  });
});

// ─── I. Design audit document exists ────────────────────────────────────────

describe('[UX0] Design audit document exists', () => {
  it('docs/design/PUBLIC-WEBSITE-DESIGN-AUDIT.md exists', () => {
    expect(fs.existsSync(path.join(cwd, 'docs/design/PUBLIC-WEBSITE-DESIGN-AUDIT.md'))).toBe(true);
  });

  it('design audit contains canonical palette and container spec', () => {
    const content = readActiveFile('docs/design/PUBLIC-WEBSITE-DESIGN-AUDIT.md');
    expect(content).toContain('emerald-500');
    expect(content).toContain('slate-900');
    expect(content).toContain('max-w-7xl');
    expect(content).toContain('Space Grotesk');
    expect(content).toContain('Inter');
  });
});

// ─── J. AutoHideNavigation has no glassmorphism or gradient CTAs ─────────────

describe('[UX0] Navigation has no glassmorphism', () => {
  it('AutoHideNavigation dropdown has no backdrop-blur', () => {
    const content = readActiveFile('components/AutoHideNavigation.tsx');
    expect(content).not.toMatch(/backdrop-blur-xl/);
  });

  it('AutoHideNavigation mobile menu has no gradient buttons', () => {
    const content = readActiveFile('components/AutoHideNavigation.tsx');
    expect(content).not.toMatch(/from-emerald-600 to-teal-600/);
  });
});

// ─── K. No temporary scratch files ──────────────────────────────────────────

describe('[UX0-R1] No temporary scratch files', () => {
  it('no _ux0-*.txt or _br1-*.txt files in repo root', () => {
    const rootFiles = fs.readdirSync(cwd);
    const scratchFiles = rootFiles.filter(
      (f) => f.startsWith('_ux0-') || f.startsWith('_br1-') || f.startsWith('_r2-') || f.startsWith('_r3-') || f.startsWith('_px1-')
    );
    expect(scratchFiles).toHaveLength(0);
  });
});

// ─── L. Public theme isolation from dashboard ───────────────────────────────

describe('[UX0-R1] Public theme isolated from dashboard', () => {
  it('haiec-design-system.css --haiec-primary is forest green (not changed to emerald)', () => {
    // The global CSS variable is shared with dashboard/product/checkout.
    // UX0 must not change it. Public marketing uses Tailwind emerald classes.
    const content = readActiveFile('styles/haiec-design-system.css');
    expect(content).toMatch(/--haiec-primary:\s*#228B22/);
    expect(content).not.toMatch(/--haiec-primary:\s*#10B981/);
  });

  it('tailwind config has heading font family', () => {
    const content = readActiveFile('tailwind.config.js');
    expect(content).toMatch(/heading.*Space.Grotesk/);
  });
});

// ─── M. Section spacing matches documentation ───────────────────────────────

describe('[UX0-R1] Section spacing consistency', () => {
  it('globals.css .section uses py-20 lg:py-28 (canonical spacing)', () => {
    const content = readActiveFile('app/globals.css');
    expect(content).toMatch(/\.section\s*\{[^}]*py-20[^}]*lg:py-28/s);
  });
});
