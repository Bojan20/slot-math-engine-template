/**
 * W214 Faza 800.1 Agent C — site footer.
 *
 * Four columns: brand blurb · product · resources · legal.
 * Year auto-updated from build time (Date.now via render).
 */

export function renderFooterHtml(opts: { depth?: 0 | 1 } = {}): string {
  const depth = opts.depth ?? 0;
  const p = (path: string): string =>
    depth === 0 ? `./pages/${path}` : `./${path}`;
  const home = depth === 0 ? './index.html' : '../index.html';
  const year = new Date().getFullYear();
  return `
    <footer class="site-footer">
      <div class="wrap">
        <div>
          <h4>slot-math-engine</h4>
          <p>Math engine + IR + cert paper trail for slot game studios.
             Ship lab-cert'd titles in 14 days, not 14 weeks.</p>
        </div>
        <div>
          <h4>Product</h4>
          <ul>
            <li><a href="${p('how-it-works.html')}">How it works</a></li>
            <li><a href="${p('pricing.html')}">Pricing</a></li>
            <li><a href="${p('coverage.html')}">Coverage</a></li>
            <li><a href="${p('demo.html')}">Demo</a></li>
          </ul>
        </div>
        <div>
          <h4>Resources</h4>
          <ul>
            <li><a href="${p('docs.html')}">Docs</a></li>
            <li><a href="${home}#roi">ROI preview</a></li>
            <li><a href="${p('contact.html')}">Get tarball</a></li>
            <li><a href="${p('contact.html')}">Talk to sales</a></li>
          </ul>
        </div>
        <div>
          <h4>Legal</h4>
          <ul>
            <li><a href="${p('contact.html')}#privacy">Privacy</a></li>
            <li><a href="${p('contact.html')}#privacy">GDPR</a></li>
            <li><a href="${p('contact.html')}">Contact</a></li>
          </ul>
        </div>
        <div class="copy">
          © ${year} slot-math-engine · Pre-orders open Q3 2026 ·
          7,679 tests passing · 77 closed-form solvers · 16/16 L&amp;W mechanics
        </div>
      </div>
    </footer>`;
}
