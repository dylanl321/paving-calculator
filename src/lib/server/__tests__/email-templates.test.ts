/**
 * Unit tests for src/lib/server/email-templates.ts
 *
 * Tests:
 *  - SYSTEM_DEFAULTS contains all required template keys
 *  - renderTemplate: variable substitution for each template type
 *  - renderTemplate: missing variables produce empty strings (graceful fallback)
 *  - renderTemplate: extra/unknown vars are ignored safely
 *  - renderTemplate: body_text null passthrough
 *  - renderTemplate: case-insensitive key lookup
 *  - HTML output is structurally valid (DOCTYPE, html, head, body tags present)
 *  - getTemplate: falls back to SYSTEM_DEFAULTS when DB returns null
 *  - getTemplate: returns DB row when present (org and system variants)
 *  - getOrgBranding: returns defaults when row is missing
 */

import { describe, it, expect, vi, type Mock } from 'vitest';
import {
  SYSTEM_DEFAULTS,
  SYSTEM_TEMPLATE_KEYS,
  ORG_TEMPLATE_KEYS,
  renderTemplate,
  getTemplate,
  getOrgBranding,
} from '../email-templates';

// ---------------------------------------------------------------------------
// Minimal D1Database stub — only .prepare().bind().first() path is needed
// ---------------------------------------------------------------------------
function makeDb(firstReturn: unknown = null) {
  const first = vi.fn().mockResolvedValue(firstReturn);
  const bind = vi.fn().mockReturnValue({ first });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { prepare, bind, first } as unknown as {
    prepare: Mock;
    bind: Mock;
    first: Mock;
    // Cast to D1Database for type compatibility
  } & import('../../../cloudflare').D1Database;
}

// ---------------------------------------------------------------------------
// SYSTEM_DEFAULTS structure
// ---------------------------------------------------------------------------
describe('SYSTEM_DEFAULTS', () => {
  it('contains every SYSTEM_TEMPLATE_KEY', () => {
    for (const key of SYSTEM_TEMPLATE_KEYS) {
      expect(SYSTEM_DEFAULTS).toHaveProperty(key);
    }
  });

  it('contains every ORG_TEMPLATE_KEY', () => {
    for (const key of ORG_TEMPLATE_KEYS) {
      expect(SYSTEM_DEFAULTS).toHaveProperty(key);
    }
  });

  it('every entry has subject, body_html, body_text strings', () => {
    for (const [key, tpl] of Object.entries(SYSTEM_DEFAULTS)) {
      expect(typeof tpl.subject, `${key}.subject`).toBe('string');
      expect(typeof tpl.body_html, `${key}.body_html`).toBe('string');
      expect(typeof tpl.body_text, `${key}.body_text`).toBe('string');
    }
  });
});

// ---------------------------------------------------------------------------
// HTML validity — very lightweight: check structural markers are present
// ---------------------------------------------------------------------------
describe('SYSTEM_DEFAULTS HTML validity', () => {
  for (const [key, tpl] of Object.entries(SYSTEM_DEFAULTS)) {
    it(`${key}: body_html has DOCTYPE, <html>, <head>, <body>`, () => {
      const html = tpl.body_html;
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html');
      expect(html).toContain('<head>');
      expect(html).toContain('<body');
      expect(html).toContain('</body>');
      expect(html).toContain('</html>');
    });
  }
});

// ---------------------------------------------------------------------------
// renderTemplate — variable substitution
// ---------------------------------------------------------------------------
describe('renderTemplate', () => {
  describe('password_reset', () => {
    const tpl = SYSTEM_DEFAULTS.password_reset;

    it('substitutes reset_link in subject, body_html, body_text', () => {
      const vars = { reset_link: 'https://paverate.com/reset?t=abc', expiry_hours: '2' };
      const result = renderTemplate(tpl, vars);
      expect(result.subject).not.toContain('{{');
      expect(result.body_html).toContain('https://paverate.com/reset?t=abc');
      expect(result.body_text).toContain('https://paverate.com/reset?t=abc');
    });

    it('substitutes expiry_hours', () => {
      const vars = { reset_link: 'https://example.com', expiry_hours: '48' };
      const result = renderTemplate(tpl, vars);
      expect(result.body_html).toContain('48');
      expect(result.body_text).toContain('48');
    });
  });

  describe('invite', () => {
    const tpl = SYSTEM_DEFAULTS.invite;

    it('substitutes org_name, invited_by, invite_link, expiry_days', () => {
      const vars = {
        org_name: 'ACME Paving',
        invited_by: 'Jane Foreman',
        invite_link: 'https://paverate.com/invite/xyz',
        expiry_days: '7',
        accent_color: '#f5a623',
      };
      const result = renderTemplate(tpl, vars);
      expect(result.subject).toContain('ACME Paving');
      expect(result.body_html).toContain('Jane Foreman');
      expect(result.body_html).toContain('https://paverate.com/invite/xyz');
      expect(result.body_text).toContain('ACME Paving');
      expect(result.body_text).toContain('https://paverate.com/invite/xyz');
    });
  });

  describe('welcome', () => {
    const tpl = SYSTEM_DEFAULTS.welcome;

    it('substitutes first_name, org_name, app_url, accent_color', () => {
      const vars = {
        first_name: 'Bob',
        org_name: 'Road Runners',
        app_url: 'https://app.paverate.com',
        accent_color: '#0066cc',
      };
      const result = renderTemplate(tpl, vars);
      expect(result.subject).toContain('Road Runners');
      expect(result.body_html).toContain('Bob');
      expect(result.body_html).toContain('https://app.paverate.com');
      expect(result.body_text).toContain('Bob');
    });
  });

  describe('eod_summary', () => {
    const tpl = SYSTEM_DEFAULTS.eod_summary;

    it('substitutes org_name, date, total_tons, total_sqyd, total_loads, mix_breakdown, crew_notes, report_url', () => {
      const vars = {
        org_name: 'Pave Co',
        date: '2026-06-03',
        total_tons: '312.5',
        total_sqyd: '4200',
        total_loads: '24',
        mix_breakdown: 'SM-9.5A: 180t\nBM-25.0: 132t',
        crew_notes: 'All good.',
        report_url: 'https://paverate.com/reports/1',
        accent_color: '#f5a623',
      };
      const result = renderTemplate(tpl, vars);
      expect(result.subject).toContain('2026-06-03');
      expect(result.body_html).toContain('312.5');
      expect(result.body_html).toContain('4200');
      expect(result.body_text).toContain('312.5');
    });
  });

  describe('email_verification', () => {
    const tpl = SYSTEM_DEFAULTS.email_verification;

    it('substitutes name and verify_link', () => {
      const vars = { name: 'Alice', verify_link: 'https://paverate.com/verify?t=tok' };
      const result = renderTemplate(tpl, vars);
      expect(result.body_html).toContain('Alice');
      expect(result.body_html).toContain('https://paverate.com/verify?t=tok');
      expect(result.body_text).toContain('Alice');
    });
  });

  describe('admin_notification', () => {
    const tpl = SYSTEM_DEFAULTS.admin_notification;

    it('substitutes alert_title, severity, timestamp, message, details, org_name, user_email', () => {
      const vars = {
        alert_title: 'DB disk > 90%',
        severity: 'critical',
        timestamp: '2026-06-03T22:00:00Z',
        message: 'Disk usage critical.',
        details: 'disk=95%',
        org_name: 'Ops',
        user_email: 'admin@paverate.com',
      };
      const result = renderTemplate(tpl, vars);
      expect(result.subject).toContain('DB disk > 90%');
      expect(result.body_html).toContain('critical');
      expect(result.body_text).toContain('critical');
    });
  });

  // -------------------------------------------------------------------------
  // Missing variables: should not crash; produce empty string for the slot
  // -------------------------------------------------------------------------
  describe('missing variables (graceful fallback)', () => {
    it('leaves empty string when variable is absent', () => {
      const tpl = {
        subject: 'Hello {{name}}',
        body_html: '<p>{{name}}</p>',
        body_text: 'Hi {{name}}',
      };
      const result = renderTemplate(tpl, {});
      expect(result.subject).toBe('Hello ');
      expect(result.body_html).toBe('<p></p>');
      expect(result.body_text).toBe('Hi ');
    });

    it('does not throw when ALL variables are missing from a real template', () => {
      for (const [, tpl] of Object.entries(SYSTEM_DEFAULTS)) {
        expect(() => renderTemplate(tpl, {})).not.toThrow();
      }
    });

    it('partial vars: only substitutes what is provided', () => {
      const tpl = {
        subject: '{{a}} and {{b}}',
        body_html: '{{a}} and {{b}}',
        body_text: null,
      };
      const result = renderTemplate(tpl, { a: 'foo' });
      expect(result.subject).toBe('foo and ');
      expect(result.body_text).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Extra / unknown vars: ignored silently, no crash
  // -------------------------------------------------------------------------
  describe('extra unknown variables', () => {
    it('ignores vars not present in the template', () => {
      const tpl = { subject: 'Hello', body_html: '<p>Hello</p>', body_text: 'Hello' };
      const result = renderTemplate(tpl, { unknown_var: 'boom' });
      expect(result.subject).toBe('Hello');
      expect(result.body_html).toBe('<p>Hello</p>');
    });
  });

  // -------------------------------------------------------------------------
  // body_text = null passthrough
  // -------------------------------------------------------------------------
  describe('body_text null passthrough', () => {
    it('returns null when template body_text is null', () => {
      const tpl = { subject: '{{x}}', body_html: '{{x}}', body_text: null };
      const result = renderTemplate(tpl, { x: 'val' });
      expect(result.body_text).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Case-insensitive key lookup
  // -------------------------------------------------------------------------
  describe('case-insensitive variable lookup', () => {
    it('substitutes {{UPPER}} when vars contains lower key', () => {
      const tpl = { subject: '{{NAME}}', body_html: '{{Name}}', body_text: '{{name}}' };
      const result = renderTemplate(tpl, { name: 'Charlie' });
      expect(result.subject).toBe('Charlie');
      expect(result.body_html).toBe('Charlie');
      expect(result.body_text).toBe('Charlie');
    });
  });
});

// ---------------------------------------------------------------------------
// getTemplate — DB fallback / DB hit
// ---------------------------------------------------------------------------
describe('getTemplate', () => {
  it('returns SYSTEM_DEFAULTS for system template when DB returns null', async () => {
    const db = makeDb(null);
    const result = await getTemplate(db as any, null, 'password_reset');
    expect(result.subject).toBe(SYSTEM_DEFAULTS.password_reset.subject);
    expect(result.body_html).toBe(SYSTEM_DEFAULTS.password_reset.body_html);
  });

  it('returns DB row for system template when DB returns a row', async () => {
    const dbRow = {
      subject: 'Custom reset',
      body_html: '<p>Custom</p>',
      body_text: 'Custom reset text',
    };
    const db = makeDb(dbRow);
    const result = await getTemplate(db as any, null, 'password_reset');
    expect(result.subject).toBe('Custom reset');
    expect(result.body_html).toBe('<p>Custom</p>');
  });

  it('returns SYSTEM_DEFAULTS for org template when DB returns null', async () => {
    const db = makeDb(null);
    const result = await getTemplate(db as any, 'org-123', 'invite');
    expect(result.subject).toBe(SYSTEM_DEFAULTS.invite.subject);
  });

  it('returns org-specific DB row for org template when found', async () => {
    // First call (org-specific) returns a row; second call (system fallback) should not be reached
    const first = vi.fn().mockResolvedValueOnce({
      subject: 'Org invite',
      body_html: '<p>org</p>',
      body_text: null,
    });
    const bind = vi.fn().mockReturnValue({ first });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as any;

    const result = await getTemplate(db, 'org-123', 'invite');
    expect(result.subject).toBe('Org invite');
  });

  it('falls back to system-level DB row for org template when org row missing', async () => {
    // First call (org lookup) → null; second call (system fallback) → row
    const first = vi
      .fn()
      .mockResolvedValueOnce(null) // org lookup
      .mockResolvedValueOnce({ subject: 'System invite', body_html: '<p>sys</p>', body_text: null }); // system fallback
    const bind = vi.fn().mockReturnValue({ first });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as any;

    const result = await getTemplate(db, 'org-123', 'invite');
    expect(result.subject).toBe('System invite');
  });

  it('skips org DB lookup for system template keys', async () => {
    // For system templates the code should NOT call prepare() with an org_id bind
    const db = makeDb(null);
    await getTemplate(db as any, 'org-xyz', 'admin_notification');
    // prepare is called once (system template query), not twice (no org lookup)
    expect(db.prepare).toHaveBeenCalledTimes(1);
  });

  it('all template keys resolve without throwing (DB returns null)', async () => {
    const allKeys = [...SYSTEM_TEMPLATE_KEYS, ...ORG_TEMPLATE_KEYS] as const;
    for (const key of allKeys) {
      const db = makeDb(null);
      await expect(getTemplate(db as any, 'org-1', key)).resolves.toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// getOrgBranding
// ---------------------------------------------------------------------------
describe('getOrgBranding', () => {
  it('returns row data when DB returns a row', async () => {
    const db = makeDb({ name: 'Pave Co', logo_url: 'https://cdn.example.com/logo.png', accent_color: '#00ff00' });
    const result = await getOrgBranding(db as any, 'org-1');
    expect(result.org_name).toBe('Pave Co');
    expect(result.logo_url).toBe('https://cdn.example.com/logo.png');
    expect(result.accent_color).toBe('#00ff00');
  });

  it('falls back to defaults when DB returns null', async () => {
    const db = makeDb(null);
    const result = await getOrgBranding(db as any, 'org-missing');
    expect(result.org_name).toBe('PaveRate');
    expect(result.logo_url).toBeNull();
    expect(result.accent_color).toBe('#f5a623');
  });

  it('falls back accent_color default when DB row has null accent_color', async () => {
    const db = makeDb({ name: 'Crew A', logo_url: null, accent_color: null });
    const result = await getOrgBranding(db as any, 'org-2');
    expect(result.accent_color).toBe('#f5a623');
  });

  it('passes through empty string org name (nullish coalescing, not falsy check)', async () => {
    // getOrgBranding uses ??, so empty string is returned as-is (not null/undefined)
    const db = makeDb({ name: '', logo_url: null, accent_color: null });
    const result = await getOrgBranding(db as any, 'org-3');
    expect(result.org_name).toBe('');
  });
});
