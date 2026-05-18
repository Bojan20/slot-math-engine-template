/**
 * Slide 5 — Cert Paper Trail.
 *
 * Cert dossier + HSM signature visual placeholder. Lab + jurisdiction
 * bundle in 200 ms.
 */

import type { LwSlide } from './deck-types.js';

export const slide: LwSlide = {
  index: 5,
  section: 'CERT PAPER TRAIL',
  title: 'One command. Four labs. Signed bundle in 200 ms.',
  subtitle:
    'Ed25519-signed dossiers, byte-deterministic across machines, regenerated from IR + commit hash for any audit — today or in five years.',
  bodyHtml: `
    <div class="lw-cert-row">
      <div class="lw-cert-card">
        <div class="lw-cert-head">GLI-19</div>
        <ul>
          <li>.zip + PAR sheet</li>
          <li>TestU01 + NIST + SCR</li>
          <li>MDD + paytable + replay</li>
          <li>Avg cycle: 6–12 weeks</li>
        </ul>
      </div>
      <div class="lw-cert-card">
        <div class="lw-cert-head">BMM</div>
        <ul>
          <li>.tar + JSON manifest</li>
          <li>PAR + TestU01 + NIST</li>
          <li>MGA PPD overlay</li>
          <li>Avg cycle: 4–8 weeks</li>
        </ul>
      </div>
      <div class="lw-cert-card">
        <div class="lw-cert-head">eCOGRA</div>
        <ul>
          <li>.zip + YAML manifest</li>
          <li>UKGC RTS-12 / RTS-14</li>
          <li>Monthly RTP roll-up</li>
          <li>Avg cycle: 3–6 weeks</li>
        </ul>
      </div>
      <div class="lw-cert-card">
        <div class="lw-cert-head">NMi</div>
        <ul>
          <li>.zip + PKCS#7 signature</li>
          <li>NMi G-MS + EU GA 2024</li>
          <li>MDD + replay</li>
          <li>Avg cycle: 6–10 weeks</li>
        </ul>
      </div>
    </div>
    <div class="lw-svg-wrap" aria-label="HSM signature schematic">
      <svg viewBox="0 0 800 220" xmlns="http://www.w3.org/2000/svg" role="img">
        <rect x="0" y="0" width="800" height="220" fill="#0a0e14"/>
        <rect x="20" y="40" width="240" height="140" fill="none" stroke="#00d9ff" stroke-width="2" rx="6"/>
        <text x="40" y="70" fill="#00d9ff" font-family="monospace" font-size="14">IR + engine commit</text>
        <text x="40" y="100" fill="#a8b5c5" font-family="monospace" font-size="12">game.json + sha256</text>
        <text x="40" y="125" fill="#a8b5c5" font-family="monospace" font-size="12">PAR + paytable + RTP</text>
        <text x="40" y="150" fill="#a8b5c5" font-family="monospace" font-size="12">jurisdiction overlay</text>

        <path d="M260 110 L340 110" stroke="#00d9ff" stroke-width="2" fill="none" marker-end="url(#arr)"/>

        <rect x="340" y="60" width="160" height="100" fill="none" stroke="#7fffd4" stroke-width="2" rx="6"/>
        <text x="360" y="90" fill="#7fffd4" font-family="monospace" font-size="13">HSM Ed25519</text>
        <text x="360" y="115" fill="#a8b5c5" font-family="monospace" font-size="11">FIPS 140-3 IG D.K</text>
        <text x="360" y="140" fill="#a8b5c5" font-family="monospace" font-size="11">PKCS#11 backed</text>

        <path d="M500 110 L580 110" stroke="#00d9ff" stroke-width="2" fill="none" marker-end="url(#arr)"/>

        <rect x="580" y="40" width="200" height="140" fill="none" stroke="#00d9ff" stroke-width="2" rx="6"/>
        <text x="600" y="70" fill="#00d9ff" font-family="monospace" font-size="14">operator-package.zip</text>
        <text x="600" y="100" fill="#a8b5c5" font-family="monospace" font-size="11">~155 files</text>
        <text x="600" y="125" fill="#a8b5c5" font-family="monospace" font-size="11">SHA-256 manifest</text>
        <text x="600" y="150" fill="#a8b5c5" font-family="monospace" font-size="11">.sig detached</text>
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="#00d9ff"/>
          </marker>
        </defs>
      </svg>
      <div class="lw-svg-caption">
        IR → HSM Ed25519 sign → operator-package.zip — same HSM key as
        the W205-W206 cert routes and W209 marketplace license JWTs.
      </div>
    </div>
  `,
};
