/**
 * CORTI W206-ONBOARDING — mock SMTP sender.
 *
 * In dev/test mode emails are appended to an in-memory outbox and
 * logged via `console.log`. A real deployment would swap this for
 * nodemailer + an SMTP relay (SES / Mailgun / Postmark).
 *
 * Templates:
 *   - welcome           on signup
 *   - verify            on signup with verifyLink
 *   - trial-expiring    25-day warn cron
 *   - trial-expired     31-day lockout cron
 *   - upgrade           upgrade confirmation
 *
 * W213 Faza 600.2: the dev log line goes through the PII redactor so
 * raw email addresses never reach stdout / a log shipper.
 */

import { redactEmail } from './pii-redactor.js';

export type EmailTemplate = 'welcome' | 'verify' | 'trial-expiring' | 'trial-expired' | 'upgrade';

export interface EmailMessage {
  to: string;
  template: EmailTemplate;
  subject: string;
  body: string;
  context: Record<string, unknown>;
  sentAt: string;
}

export interface SendInput {
  to: string;
  template: EmailTemplate;
  context: Record<string, unknown>;
}

const SUBJECTS: Record<EmailTemplate, string> = {
  welcome: 'Welcome to the Slot Math Engine',
  verify: 'Please verify your email',
  'trial-expiring': 'Your trial expires soon',
  'trial-expired': 'Your trial has expired',
  upgrade: 'Subscription upgraded',
};

function renderBody(template: EmailTemplate, ctx: Record<string, unknown>): string {
  switch (template) {
    case 'welcome':
      return [
        `Hi ${String(ctx.name ?? ctx.email ?? 'there')},`,
        '',
        'Welcome to the Slot Math Engine. Your 30-day trial is now active.',
        `Tenant: ${String(ctx.tenantId ?? '')}`,
        `License: ${String(ctx.licenseKey ?? '')}`,
        '',
        'Get started: open Studio and create your first workspace.',
        '',
        '— The Engine Team',
      ].join('\n');
    case 'verify':
      return [
        `Hi ${String(ctx.email ?? '')},`,
        '',
        'Please verify your email to activate your trial.',
        `Verify: ${String(ctx.verifyLink ?? '#')}`,
        '',
        '— The Engine Team',
      ].join('\n');
    case 'trial-expiring':
      return [
        `Hi ${String(ctx.email ?? '')},`,
        '',
        `Your trial expires in ${String(ctx.daysUntil ?? '?')} days.`,
        'Upgrade now to keep your workspaces, simulations, and cert dossiers.',
        `Upgrade: ${String(ctx.upgradeLink ?? '#')}`,
      ].join('\n');
    case 'trial-expired':
      return [
        `Hi ${String(ctx.email ?? '')},`,
        '',
        'Your trial has expired. Access to MC runs and cert submissions has been locked.',
        `Reactivate: ${String(ctx.upgradeLink ?? '#')}`,
      ].join('\n');
    case 'upgrade':
      return [
        `Hi ${String(ctx.email ?? '')},`,
        '',
        `You are now on the ${String(ctx.tier ?? 'pro').toUpperCase()} plan.`,
        'Limits and SLA have been updated immediately.',
      ].join('\n');
  }
}

export class EmailSender {
  private readonly outbox: EmailMessage[] = [];
  private readonly devLog: boolean;

  constructor(opts: { devLog?: boolean } = {}) {
    this.devLog = opts.devLog ?? process.env.NODE_ENV !== 'test';
  }

  send(input: SendInput): EmailMessage {
    const msg: EmailMessage = {
      to: input.to,
      template: input.template,
      subject: SUBJECTS[input.template],
      body: renderBody(input.template, input.context),
      context: input.context,
      sentAt: new Date().toISOString(),
    };
    this.outbox.push(msg);
    if (this.devLog) {
      // PII redacted: bo***@example.com style — see lib/pii-redactor.ts.
      // eslint-disable-next-line no-console
      console.log(`[email] to-redacted=${redactEmail(msg.to)} template=${msg.template} subject="${msg.subject}"`);
    }
    return msg;
  }

  outboxFor(to: string): EmailMessage[] {
    return this.outbox.filter((m) => m.to === to);
  }

  all(): readonly EmailMessage[] {
    return this.outbox;
  }

  /** Test-only. */
  reset(): void {
    this.outbox.length = 0;
  }
}
