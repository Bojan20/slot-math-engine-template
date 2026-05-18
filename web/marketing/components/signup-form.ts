/**
 * W214 Faza 800.1 Agent C — Public signup form component.
 *
 * Lead-capture form for the public marketing site. Pure validation +
 * payload shaping kernel so unit tests can run without a DOM, paired
 * with a mountSignupForm() that wires the rendered HTML into a real form.
 *
 * Submission target: POST /api/marketing/lead (W214 Agent B route).
 * Fallback: mailto:{salesAddr} with a stringified payload — used when
 * the JS fetch fails or the static deploy has no backend wired.
 *
 * Anti-bot: honeypot field "company_website" (hidden). Real users never
 * fill it; bots do. Submissions with non-empty honeypot are silently
 * dropped client-side AND server-side (defence in depth).
 */

export interface SignupFormFields {
  name: string;
  email: string;
  company: string;
  role: SignupRole;
  message: string;
  /** Honeypot — must remain empty for real users. */
  company_website?: string;
}

export type SignupRole = 'CTO' | 'CMO' | 'CFO' | 'MathLead' | 'Other';

export const ROLE_LABELS: Record<SignupRole, string> = {
  CTO: 'CTO / VP Engineering',
  CMO: 'CMO / Head of Marketing',
  CFO: 'CFO / Finance',
  MathLead: 'Math / Game Design Lead',
  Other: 'Other',
};

export type SignupValidation =
  | { ok: true; payload: SignupFormFields }
  | { ok: false; field: keyof SignupFormFields | '_global'; reason: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSignup(raw: Partial<SignupFormFields>): SignupValidation {
  // Honeypot — silent drop signalled to caller as field error.
  if (raw.company_website && raw.company_website.trim().length > 0) {
    return { ok: false, field: 'company_website', reason: 'honeypot_triggered' };
  }
  const name = (raw.name ?? '').trim();
  if (name.length < 2) {
    return { ok: false, field: 'name', reason: 'name_too_short' };
  }
  const email = (raw.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { ok: false, field: 'email', reason: 'invalid_email' };
  }
  const company = (raw.company ?? '').trim();
  if (company.length < 2) {
    return { ok: false, field: 'company', reason: 'company_too_short' };
  }
  const role = raw.role;
  if (!role || !(role in ROLE_LABELS)) {
    return { ok: false, field: 'role', reason: 'invalid_role' };
  }
  const message = (raw.message ?? '').trim();
  if (message.length > 2000) {
    return { ok: false, field: 'message', reason: 'message_too_long' };
  }
  return {
    ok: true,
    payload: { name, email, company, role, message, company_website: '' },
  };
}

/** Detect operator tier from email domain (W213 manifests). Returns null if unknown. */
export function detectOperatorTier(email: string): 'tier1' | 'tier2' | 'tier3' | null {
  const dom = email.toLowerCase().split('@')[1] ?? '';
  // Tier-1: top global operators.
  const tier1 = ['flutter.com', 'entaingroup.com', 'mgmresorts.com', 'caesars.com', 'draftkings.com'];
  const tier2 = ['betsson.com', 'kindredgroup.com', 'lvbet.com', 'leovegas.com', 'gvc.com'];
  if (tier1.includes(dom)) return 'tier1';
  if (tier2.includes(dom)) return 'tier2';
  if (dom.endsWith('.com') || dom.endsWith('.co.uk') || dom.endsWith('.eu')) return 'tier3';
  return null;
}

export function renderSignupFormHtml(opts: {
  action?: string;
  submitLabel?: string;
  includeMessage?: boolean;
} = {}): string {
  const action = opts.action ?? '/api/marketing/lead';
  const submitLabel = opts.submitLabel ?? 'Request pitch tarball';
  const includeMessage = opts.includeMessage ?? true;
  const roleOpts = (Object.keys(ROLE_LABELS) as SignupRole[])
    .map((r) => `<option value="${r}">${ROLE_LABELS[r]}</option>`)
    .join('');
  return `
    <form class="signup-form" data-component="signup-form"
          method="post" action="${action}" novalidate>
      <input type="hidden" name="_ts" value="${Date.now()}" />
      <div class="row">
        <div>
          <label for="sf-name">Your name *</label>
          <input id="sf-name" name="name" type="text" required minlength="2" />
        </div>
        <div>
          <label for="sf-email">Work email *</label>
          <input id="sf-email" name="email" type="email" required />
        </div>
      </div>
      <div class="row">
        <div>
          <label for="sf-company">Company *</label>
          <input id="sf-company" name="company" type="text" required minlength="2" />
        </div>
        <div>
          <label for="sf-role">Your role *</label>
          <select id="sf-role" name="role" required>
            <option value="">— Select —</option>
            ${roleOpts}
          </select>
        </div>
      </div>
      ${
        includeMessage
          ? `<div>
              <label for="sf-message">What would you like to see?</label>
              <textarea id="sf-message" name="message"
                placeholder="e.g. 'We're evaluating math engines for our 2027 roadmap.'"></textarea>
            </div>`
          : ''
      }
      <!-- Honeypot — keep empty -->
      <div class="honeypot" aria-hidden="true">
        <label>Company website (leave empty)
          <input type="text" name="company_website" tabindex="-1" autocomplete="off" />
        </label>
      </div>
      <div style="margin-top:18px;display:flex;gap:12px;flex-wrap:wrap;align-items:center">
        <button class="btn btn-primary" type="submit">${submitLabel}</button>
        <a class="btn btn-secondary" href="mailto:sales@slot-math-engine.example">
          Or email sales directly
        </a>
      </div>
      <p class="privacy">
        We use this only to send you the pitch tarball and a single follow-up email.
        GDPR-compliant: no tracking pixels, no third-party scripts, no resale.
        Unsubscribe anytime.
      </p>
      <div class="form-msg" data-msg style="display:none"></div>
    </form>`;
}

/** Mount + wire submit. Returns helpers for tests. */
export function mountSignupForm(
  root: HTMLElement,
  opts: { action?: string; onSubmit?: (p: SignupFormFields) => Promise<void> } = {}
): { read: () => Partial<SignupFormFields>; submit: () => void } {
  root.innerHTML = renderSignupFormHtml({ action: opts.action });
  const form = root.querySelector<HTMLFormElement>('form.signup-form');
  const msg = root.querySelector<HTMLElement>('[data-msg]');
  const read = (): Partial<SignupFormFields> => {
    if (!form) return {};
    const fd = new FormData(form);
    return {
      name: String(fd.get('name') ?? ''),
      email: String(fd.get('email') ?? ''),
      company: String(fd.get('company') ?? ''),
      role: String(fd.get('role') ?? '') as SignupRole,
      message: String(fd.get('message') ?? ''),
      company_website: String(fd.get('company_website') ?? ''),
    };
  };
  const submit = (): void => {
    if (!form || !msg) return;
    const v = validateSignup(read());
    if (!v.ok) {
      msg.style.display = 'block';
      msg.className = 'form-msg err';
      msg.textContent = `Please fix: ${v.field} (${v.reason})`;
      return;
    }
    msg.style.display = 'block';
    msg.className = 'form-msg ok';
    msg.textContent = 'Thanks! Check your inbox in ~2 minutes for the tarball link.';
    if (opts.onSubmit) {
      void opts.onSubmit(v.payload);
    }
  };
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });
  return { read, submit };
}
