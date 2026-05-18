/**
 * CORTI W207-DOCS - Interactive playground.
 *
 * Three pure functions + DOM wiring:
 *
 *   validateIR(json)       -> ValidationReport
 *   generateCurl(ir, url)  -> string (a multi-line cURL example)
 *   testWebSocket(url)     -> Promise<WebSocketReport>
 *
 * The pure functions are tested in tests/main.test.ts; the DOM wiring is
 * exercised only via the dev server.
 */

export interface ValidationReport {
  ok: boolean;
  errors: string[];
  parsed: unknown;
}

export interface WebSocketReport {
  ok: boolean;
  url: string;
  error?: string;
}

const REQUIRED_FIELDS = ['gameId', 'topology', 'symbols'] as const;

export function validateIR(jsonText: string): ValidationReport {
  const errors: string[] = [];
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    return {
      ok: false,
      errors: [`JSON parse error: ${e instanceof Error ? e.message : String(e)}`],
      parsed: null,
    };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, errors: ['IR must be a JSON object'], parsed };
  }
  const obj = parsed as Record<string, unknown>;
  for (const f of REQUIRED_FIELDS) {
    if (!(f in obj)) errors.push(`missing required field: ${f}`);
  }
  if ('topology' in obj) {
    const t = obj.topology as Record<string, unknown>;
    if (!t || typeof t !== 'object') errors.push('topology must be an object');
    else {
      if (typeof t.kind !== 'string') errors.push('topology.kind must be a string');
      if (typeof t.reels !== 'number') errors.push('topology.reels must be a number');
      if (!(typeof t.rows === 'number' || Array.isArray(t.rows))) {
        errors.push('topology.rows must be number or number[]');
      }
    }
  }
  if ('symbols' in obj) {
    const s = obj.symbols as Record<string, unknown>;
    if (!s || typeof s !== 'object') errors.push('symbols must be an object');
    else if (Object.keys(s).length === 0) errors.push('symbols must have at least one entry');
    else {
      for (const [k, v] of Object.entries(s)) {
        if (typeof v !== 'number' || v <= 0) {
          errors.push(`symbols.${k} must be a positive number`);
        }
      }
    }
  }
  if ('rtpTarget' in obj && typeof obj.rtpTarget === 'number') {
    const r = obj.rtpTarget;
    if (r < 0.85 || r > 0.99) errors.push('rtpTarget should be in [0.85, 0.99]');
  }
  return { ok: errors.length === 0, errors, parsed };
}

export function generateCurl(ir: unknown, apiUrl: string): string {
  const safeUrl = apiUrl.replace(/\/$/, '');
  const body = JSON.stringify(ir, null, 2);
  return [
    `curl -X POST '${safeUrl}/api/gaas/compute-rtp' \\`,
    `  -H 'content-type: application/json' \\`,
    `  -H 'x-api-key: YOUR_KEY' \\`,
    `  -d '${escapeShell(body)}'`,
  ].join('\n');
}

function escapeShell(s: string): string {
  return s.replace(/'/g, "'\\''");
}

export function testWebSocket(
  apiUrl: string,
  WS: typeof WebSocket | undefined = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket,
  timeoutMs = 4000
): Promise<WebSocketReport> {
  return new Promise<WebSocketReport>((resolve) => {
    const url = apiUrl.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://') + '/api/gaas/live';
    if (!WS) {
      resolve({ ok: false, url, error: 'WebSocket impl not available' });
      return;
    }
    let settled = false;
    const finish = (r: WebSocketReport) => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch { /* ignore */ }
      resolve(r);
    };
    let ws: WebSocket;
    try {
      ws = new WS(url);
    } catch (e) {
      resolve({ ok: false, url, error: e instanceof Error ? e.message : String(e) });
      return;
    }
    const timer = setTimeout(() => finish({ ok: false, url, error: 'timeout' }), timeoutMs);
    ws.onopen = () => { /* wait for session-start */ };
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
        if (data.type === 'session-start') {
          clearTimeout(timer);
          finish({ ok: true, url });
        }
      } catch { /* ignore non-JSON frames */ }
    };
    ws.onerror = () => {
      clearTimeout(timer);
      finish({ ok: false, url, error: 'transport_error' });
    };
    ws.onclose = () => {
      clearTimeout(timer);
      finish({ ok: false, url, error: 'closed' });
    };
  });
}

export const DEFAULT_IR_SAMPLE = JSON.stringify(
  {
    schemaVersion: '2.0',
    gameId: 'demo-game-1',
    topology: { kind: 'rectangular', reels: 5, rows: 3 },
    symbols: { HP: 3, MP: 3, LP: 3, WILD: 1 },
    features: { free_spins: { trigger: 3, count: 10 } },
    rtpTarget: 0.955,
    jurisdictions: ['GENERIC'],
  },
  null,
  2
);

/** Wire DOM. Called from main.ts when the playground view becomes visible. */
export function mountPlayground(root: Document = document): void {
  const editor = root.getElementById('pg-editor') as HTMLTextAreaElement | null;
  const output = root.getElementById('pg-output');
  const urlInput = root.getElementById('pg-url') as HTMLInputElement | null;
  const btnValidate = root.getElementById('pg-validate');
  const btnCurl = root.getElementById('pg-curl');
  const btnWs = root.getElementById('pg-ws-test');
  if (!editor || !output || !urlInput) return;
  if (!editor.value) editor.value = DEFAULT_IR_SAMPLE;

  const setOutput = (text: string, kind: 'ok' | 'err' | '' = '') => {
    output.textContent = text;
    output.className = `pg-output${kind ? ' ' + kind : ''}`;
  };

  btnValidate?.addEventListener('click', () => {
    const r = validateIR(editor.value);
    if (r.ok) {
      setOutput(`OK - IR is valid.\n\nParsed:\n${JSON.stringify(r.parsed, null, 2)}`, 'ok');
    } else {
      setOutput(`Validation failed:\n- ${r.errors.join('\n- ')}`, 'err');
    }
  });

  btnCurl?.addEventListener('click', () => {
    const r = validateIR(editor.value);
    if (!r.ok) {
      setOutput(`Validation failed:\n- ${r.errors.join('\n- ')}`, 'err');
      return;
    }
    setOutput(generateCurl(r.parsed, urlInput.value), 'ok');
  });

  btnWs?.addEventListener('click', async () => {
    setOutput('Connecting to WebSocket...');
    const r = await testWebSocket(urlInput.value);
    if (r.ok) setOutput(`OK - WebSocket connected.\nURL: ${r.url}`, 'ok');
    else setOutput(`WebSocket failed.\nURL: ${r.url}\nError: ${r.error}`, 'err');
  });
}
