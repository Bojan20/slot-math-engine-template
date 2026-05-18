// CORTI W206-ONBOARDING — page renderers.

import { el, clear } from '@shared/dom.js';
import type { OnboardingState, Route, Tier } from './types.js';
import {
  PLANS,
  ALL_JURISDICTIONS,
  validateSignup,
  passwordStrength,
  planFor,
} from './data.js';
import { WIZARD_STEPS, progressPercent, markStepComplete, skipStep, backStep, isWizardComplete } from './wizard.js';

type Toast = (msg: string, kind?: 'ok' | 'warn' | 'err') => void;
type Navigate = (route: Route) => void;

export function renderLanding(host: HTMLElement, _state: OnboardingState, navigate: Navigate): void {
  clear(host);

  const hero = el('div', { className: 'hero' });
  const h1 = el('h1');
  h1.innerHTML = 'Ship slot math <em>10× faster.</em>';
  hero.appendChild(h1);
  hero.appendChild(
    el(
      'p',
      {},
      [
        'Closed-form RTP, Monte Carlo validation, jurisdiction-aware PAR sheets, and HSM-signed operator packages — in one engine your team can deploy on day one.',
      ]
    )
  );
  const ctas = el('div', { className: 'ctas' });
  const trialBtn = el('button', { className: 'btn primary' }, ['Start 30-day free trial']);
  trialBtn.addEventListener('click', () => navigate('signup'));
  const plansBtn = el('button', { className: 'btn ghost' }, ['Compare plans']);
  plansBtn.addEventListener('click', () => navigate('plans'));
  ctas.appendChild(trialBtn);
  ctas.appendChild(plansBtn);
  hero.appendChild(ctas);
  host.appendChild(hero);

  const grid = el('div', { className: 'value-grid' });
  for (const v of [
    { icon: '⚡', title: 'Closed-form solver', body: '77 kernels covering L&W M1-M16, cluster, Megaways, hold-and-spin, cascade trees.' },
    { icon: '🛡️', title: 'Cert paper trail', body: 'PAR sheet + HSM signature + audit chain in one operator-package.zip.' },
    { icon: '🎯', title: '16 jurisdictions', body: 'UKGC, MGA, NJ, ON, AAMS, DGA, SGA — auto-gating per market.' },
    { icon: '📈', title: 'GaaS-ready', body: 'WebSocket spin stream + REST API. Embed in your operator stack in days.' },
  ]) {
    const card = el('div', { className: 'value-card' });
    card.appendChild(el('div', { className: 'icon' }, [v.icon]));
    card.appendChild(el('h3', {}, [v.title]));
    card.appendChild(el('p', {}, [v.body]));
    grid.appendChild(card);
  }
  host.appendChild(grid);
}

export function renderSignup(host: HTMLElement, state: OnboardingState, navigate: Navigate, toast: Toast, onSubmit: () => Promise<void>): void {
  clear(host);

  const card = el('div', { className: 'card' });
  card.appendChild(el('h2', {}, ['Create your account']));
  card.appendChild(el('p', { style: 'color:var(--text-1);margin:0 0 18px;' }, ['Start your 30-day free trial. No credit card required.']));

  const form = el('form') as HTMLFormElement;

  // email
  form.appendChild(makeField('email', 'Email', 'email', state.signup.email, state.signupErrors.email, (v) => { state.signup.email = v; }));
  // company
  form.appendChild(makeField('company', 'Company', 'text', state.signup.company, state.signupErrors.company, (v) => { state.signup.company = v; }));

  // jurisdiction
  const jurField = el('label', { className: 'field' });
  jurField.appendChild(el('span', {}, ['Primary jurisdiction']));
  const jurSel = el('select') as HTMLSelectElement;
  for (const j of ALL_JURISDICTIONS) {
    const o = el('option', { value: j }, [j]) as HTMLOptionElement;
    if (state.signup.jurisdiction === j) o.selected = true;
    jurSel.appendChild(o);
  }
  jurSel.addEventListener('change', () => { state.signup.jurisdiction = jurSel.value; });
  jurField.appendChild(jurSel);
  if (state.signupErrors.jurisdiction) jurField.appendChild(el('div', { className: 'err' }, [state.signupErrors.jurisdiction]));
  form.appendChild(jurField);

  // use case
  const ucField = el('label', { className: 'field' });
  ucField.appendChild(el('span', {}, ['Primary use case']));
  const ucSel = el('select') as HTMLSelectElement;
  for (const uc of [
    'L&W cert pipeline',
    'Megaways math validation',
    'Cluster pays research',
    'New supplier R&D',
    'Regulator certification',
    'Educational / research',
  ]) {
    const o = el('option', { value: uc }, [uc]) as HTMLOptionElement;
    if (state.signup.useCase === uc) o.selected = true;
    ucSel.appendChild(o);
  }
  if (!state.signup.useCase) state.signup.useCase = 'L&W cert pipeline';
  ucSel.value = state.signup.useCase;
  ucSel.addEventListener('change', () => { state.signup.useCase = ucSel.value; });
  ucField.appendChild(ucSel);
  if (state.signupErrors.useCase) ucField.appendChild(el('div', { className: 'err' }, [state.signupErrors.useCase]));
  form.appendChild(ucField);

  // password
  const pwField = makeField('password', 'Password (10+ chars, mix case + digit)', 'password', state.signup.password, state.signupErrors.password, (v) => { state.signup.password = v; });
  form.appendChild(pwField);
  const strength = passwordStrength(state.signup.password);
  const meter = el('div', { className: 'crumb', style: 'font-size:11px;margin-top:-10px;margin-bottom:14px;' }, [`Strength: ${strength.message}`]);
  form.appendChild(meter);

  // confirm
  form.appendChild(makeField('confirmPassword', 'Confirm password', 'password', state.signup.confirmPassword, state.signupErrors.confirmPassword, (v) => { state.signup.confirmPassword = v; }));

  const submit = el('button', { className: 'btn primary', type: 'submit', style: 'width:100%;padding:12px;' }, ['Create account · start 30-day trial']);
  form.appendChild(submit);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const result = validateSignup(state.signup);
    state.signupErrors = result.errors;
    if (!result.ok) {
      toast('Please fix the highlighted fields', 'warn');
      renderSignup(host, state, navigate, toast, onSubmit);
      return;
    }
    void onSubmit();
  });

  card.appendChild(form);
  host.appendChild(card);
}

function makeField(
  name: string,
  label: string,
  type: string,
  value: string,
  err: string | undefined,
  onInput: (v: string) => void
): HTMLElement {
  const wrap = el('label', { className: 'field' });
  wrap.appendChild(el('span', {}, [label]));
  const input = el('input', { name, type }) as HTMLInputElement;
  input.value = value;
  input.addEventListener('input', () => onInput(input.value));
  wrap.appendChild(input);
  if (err) wrap.appendChild(el('div', { className: 'err' }, [err]));
  return wrap;
}

export function renderVerify(host: HTMLElement, state: OnboardingState, navigate: Navigate): void {
  clear(host);
  const card = el('div', { className: 'card' });
  card.appendChild(el('h2', {}, ['Verify your email']));
  card.appendChild(el('p', {}, [
    state.result?.verified
      ? 'Email auto-verified in dev mode. You can continue.'
      : `We sent a verification link to ${state.signup.email}. Click it to activate your trial.`,
  ]));
  const btn = el('button', { className: 'btn primary' }, ['Choose plan']);
  btn.addEventListener('click', () => navigate('plans'));
  card.appendChild(btn);
  host.appendChild(card);
}

export function renderPlans(host: HTMLElement, state: OnboardingState, navigate: Navigate, toast: Toast): void {
  clear(host);
  const wrap = el('div', { className: 'card wide' });
  wrap.appendChild(el('h2', {}, ['Choose your plan']));
  wrap.appendChild(el('p', { style: 'color:var(--text-1);margin:0 0 24px;' }, ['Start free for 30 days. Upgrade any time.']));

  const grid = el('div', { className: 'plan-grid' });
  for (const plan of PLANS) {
    const card = el('div', { className: `plan-card ${plan.popular ? 'is-popular' : ''}` });
    card.appendChild(el('h3', {}, [plan.name]));
    const price = el('div', { className: 'price' }, [plan.priceLabel]);
    price.appendChild(el('small', {}, [' ' + plan.priceDetail]));
    card.appendChild(price);

    const ul = el('ul');
    for (const f of plan.features) {
      ul.appendChild(el('li', { className: f.included ? '' : 'no' }, [f.label]));
    }
    card.appendChild(ul);

    const btn = el('button', { className: `btn ${plan.popular ? 'primary' : ''}` }, [plan.cta]);
    btn.addEventListener('click', () => {
      state.selectedTier = plan.tier;
      if (plan.tier === 'trial') {
        toast('Trial active. Launching onboarding wizard.', 'ok');
        navigate('wizard');
      } else if (plan.tier === 'enterprise') {
        toast('Sales contacted — we will reach out within 24h.', 'ok');
      } else {
        upgradeTier(state, plan.tier, toast);
        navigate('wizard');
      }
    });
    card.appendChild(btn);
    grid.appendChild(card);
  }
  wrap.appendChild(grid);
  host.appendChild(wrap);
}

async function upgradeTier(state: OnboardingState, tier: Tier, toast: Toast): Promise<void> {
  if (!state.result) return;
  try {
    const res = await fetch(`http://localhost:4000/api/license/${state.result.tenantId}/upgrade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier }),
    });
    if (res.ok) {
      toast(`Upgraded to ${tier.toUpperCase()}`, 'ok');
    } else {
      toast('Upgrade failed — try again', 'err');
    }
  } catch {
    toast('Network error during upgrade', 'err');
  }
}

export function renderWizard(host: HTMLElement, state: OnboardingState, navigate: Navigate, toast: Toast, persist: () => void): void {
  clear(host);

  const card = el('div', { className: 'card wide' });
  card.appendChild(el('h2', {}, ['Get started · 5-step tour']));
  card.appendChild(el('p', { style: 'color:var(--text-1);margin:0 0 18px;' }, [`Progress: ${progressPercent(state.wizard)}%`]));

  // bar
  const bar = el('div', { className: 'wizard-bar' });
  for (let i = 0; i < WIZARD_STEPS.length; i++) {
    const step = WIZARD_STEPS[i];
    const cls = state.wizard.completed.has(step.id)
      ? 'wizard-step is-done'
      : i === state.wizard.current
      ? 'wizard-step is-active'
      : 'wizard-step';
    const node = el('div', { className: cls });
    node.appendChild(el('div', { className: 'num' }, [String(i + 1)]));
    node.appendChild(el('div', { className: 'label' }, [step.title.split(' ').slice(0, 2).join(' ')]));
    bar.appendChild(node);
  }
  card.appendChild(bar);

  if (isWizardComplete(state.wizard)) {
    const done = el('div', { className: 'celebrate' });
    done.appendChild(el('div', { className: 'emoji' }, ['🏆']));
    done.appendChild(el('h2', {}, ['Onboarding complete!']));
    done.appendChild(el('p', {}, ['You are ready to ship slot math. Head to your dashboard for pinned tasks and usage stats.']));
    const goBtn = el('button', { className: 'btn primary' }, ['Open dashboard']);
    goBtn.addEventListener('click', () => navigate('dashboard'));
    done.appendChild(goBtn);
    card.appendChild(done);
    host.appendChild(card);
    return;
  }

  const step = WIZARD_STEPS[state.wizard.current];
  const body = el('div', { className: 'wizard-body' });
  body.appendChild(el('h2', {}, [step.title]));
  body.appendChild(el('p', {}, [step.description]));

  const deeplink = el('a', { href: step.deeplink, target: '_blank', rel: 'noopener' }) as HTMLAnchorElement;
  const ll = el('button', { className: 'btn primary', type: 'button' }, [step.cta]);
  ll.addEventListener('click', (e) => {
    e.preventDefault();
    window.open(step.deeplink, '_blank', 'noopener');
    toast(`Opened ${step.cta}`, 'ok');
  });
  deeplink.appendChild(ll);
  body.appendChild(deeplink);

  const actions = el('div', { className: 'wizard-actions' });
  const back = el('button', { className: 'btn ghost' }, ['Back']) as HTMLButtonElement;
  back.disabled = state.wizard.current === 0;
  back.addEventListener('click', () => {
    state.wizard = backStep(state.wizard);
    persist();
    renderWizard(host, state, navigate, toast, persist);
  });
  const right = el('div', { style: 'display:flex;gap:8px;' });
  const skip = el('button', { className: 'btn ghost' }, ['Skip step']);
  skip.addEventListener('click', () => {
    state.wizard = skipStep(state.wizard);
    persist();
    renderWizard(host, state, navigate, toast, persist);
  });
  const mark = el('button', { className: 'btn primary' }, ['Mark complete']);
  mark.addEventListener('click', () => {
    state.wizard = markStepComplete(state.wizard, step.id);
    persist();
    toast(`${step.title} marked complete`, 'ok');
    renderWizard(host, state, navigate, toast, persist);
  });
  right.appendChild(skip);
  right.appendChild(mark);
  actions.appendChild(back);
  actions.appendChild(right);
  body.appendChild(actions);

  card.appendChild(body);
  host.appendChild(card);
}

export function renderDashboard(host: HTMLElement, state: OnboardingState, navigate: Navigate, toast: Toast): void {
  clear(host);

  const head = el('div', { className: 'card wide', style: 'margin-bottom: 18px;' });
  head.appendChild(el('h2', {}, [`Welcome${state.signup.company ? `, ${state.signup.company}` : ''}`]));
  head.appendChild(el('p', { style: 'color:var(--text-1);margin:0;' }, [
    `You are on the ${planFor(state.selectedTier).name} plan${state.result ? ` · tenant ${state.result.tenantId}` : ''}.`,
  ]));
  host.appendChild(head);

  const grid = el('div', { className: 'dash-grid' });

  const tasks = el('div', { className: 'dash-tasks' });
  tasks.appendChild(el('h3', {}, ['Starter tasks']));
  for (const step of WIZARD_STEPS) {
    const row = el('div', { className: `dash-task ${state.wizard.completed.has(step.id) ? 'done' : ''}` });
    const cb = el('input', { type: 'checkbox' }) as HTMLInputElement;
    cb.checked = state.wizard.completed.has(step.id);
    cb.addEventListener('change', () => {
      if (cb.checked) state.wizard.completed.add(step.id);
      else state.wizard.completed.delete(step.id);
      renderDashboard(host, state, navigate, toast);
    });
    row.appendChild(cb);
    row.appendChild(el('span', {}, [step.title]));
    tasks.appendChild(row);
  }
  const wizBtn = el('button', { className: 'btn primary', style: 'margin-top:12px;' }, ['Resume wizard']);
  wizBtn.addEventListener('click', () => navigate('wizard'));
  tasks.appendChild(wizBtn);
  grid.appendChild(tasks);

  const stats = el('div', { className: 'dash-stats' });
  const trialDaysLeft = state.result
    ? Math.max(0, Math.ceil((new Date(state.result.trialExpiresAt).getTime() - Date.now()) / 86_400_000))
    : 30;
  for (const s of [
    { label: 'Trial days left', value: state.selectedTier === 'trial' ? String(trialDaysLeft) : '∞' },
    { label: 'Games created', value: String(state.wizard.completed.has('workspace') ? 1 : 0) },
    { label: 'MC runs today', value: String(state.wizard.completed.has('certify') ? 1 : 0) },
    { label: 'Tier', value: planFor(state.selectedTier).name },
  ]) {
    const card = el('div', { className: 'stat-card' });
    card.appendChild(el('div', { className: 'label' }, [s.label]));
    card.appendChild(el('div', { className: 'value' }, [s.value]));
    stats.appendChild(card);
  }
  grid.appendChild(stats);

  host.appendChild(grid);
}
