/**
 * Example: Cert lab integration.
 *
 * Submits an operator-package.zip to the cert lab REST endpoint and polls
 * for the signed cert PDF.
 *
 * Expected output:
 *   submitted -> trackingId=cert-...
 *   status: queued
 *   status: running
 *   status: passed, pdf=https://cert.example.com/signed/cert-...pdf
 *
 * Run:
 *   tsx examples/cert-lab-integration.ts ./operator-package.zip
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const API_URL = process.env.CERT_API_URL ?? 'http://localhost:4000';
const API_KEY = process.env.CERT_API_KEY ?? '';

async function main(): Promise<void> {
  const pkgPath = process.argv[2];
  if (!pkgPath) throw new Error('usage: tsx cert-lab-integration.ts <package.zip>');
  const buf = readFileSync(resolve(pkgPath));

  // 1. Submit the package.
  const submit = await fetch(`${API_URL}/api/cert/submit`, {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      'x-api-key': API_KEY,
      'x-package-name': pkgPath.split('/').pop() ?? 'operator-package.zip',
    },
    body: buf,
  }).then((r) => r.json() as Promise<{ trackingId: string }>);
  console.log(`submitted -> trackingId=${submit.trackingId}`);

  // 2. Poll status every 3s. In production wire a webhook instead.
  while (true) {
    const status = (await fetch(`${API_URL}/api/cert/${submit.trackingId}`, {
      headers: { 'x-api-key': API_KEY },
    }).then((r) => r.json())) as { state: string; pdfUrl?: string };
    console.log(`status: ${status.state}${status.pdfUrl ? `, pdf=${status.pdfUrl}` : ''}`);
    if (status.state === 'passed' || status.state === 'failed') break;
    await new Promise((r) => setTimeout(r, 3000));
  }
}

main().catch((err) => {
  console.error('cert lab submit failed', err);
  process.exit(1);
});
