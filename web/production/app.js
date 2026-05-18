// CORTI 200.8 — Production stats dashboard (vanilla JS).
//
// Renders KPIs + a top-50 table from mock production data. Reads
// `./data.json` so the same file feeds the dashboard and the
// production-stats vitest spec.

const dataUrl = new URL('./data.json', import.meta.url).href;

async function main() {
  const res = await fetch(dataUrl);
  const data = await res.json();
  renderKpis(data);
  renderTable(data);
}

function fmtUsd(n) { return '$' + Math.round(n).toLocaleString('en-US'); }

function renderKpis(d) {
  const grid = document.getElementById('kpi-grid');
  const totalRev = d.games.reduce((a, g) => a + g.daily_revenue_usd, 0);
  const totalDeploys = d.games.length;
  const top = d.games.slice().sort((a, b) => b.daily_revenue_usd - a.daily_revenue_usd)[0];
  const avgRtp = d.games.reduce((a, g) => a + g.rtp, 0) / d.games.length;
  const errorRate = d.games.reduce((a, g) => a + g.error_rate, 0) / d.games.length;
  const kpis = [
    ['Games Deployed', totalDeploys.toString()],
    ['Daily Revenue', fmtUsd(totalRev)],
    ['Top Earner', `${top.id} (${fmtUsd(top.daily_revenue_usd)})`],
    ['Avg RTP', avgRtp.toFixed(3)],
    ['Error Rate', (errorRate * 100).toFixed(3) + '%'],
    ['Jurisdictions', d.jurisdictions.length.toString()],
  ];
  grid.innerHTML = kpis.map(([l, v]) =>
    `<div class="kpi"><div class="label">${l}</div><div class="value">${v}</div></div>`,
  ).join('');
}

function renderTable(d) {
  const tbl = document.getElementById('games-table');
  const top = d.games.slice().sort((a, b) => b.daily_revenue_usd - a.daily_revenue_usd).slice(0, 50);
  tbl.innerHTML = `<table><thead><tr>
    <th>Rank</th><th>Game ID</th><th>Jurisdiction</th><th>Cabinet</th>
    <th class="num">Daily Revenue</th><th class="num">RTP</th><th class="num">Hit %</th><th class="num">Errors</th>
  </tr></thead><tbody>` +
    top.map((g, i) =>
      `<tr><td>${i + 1}</td><td>${g.id}</td><td><span class="tag">${g.jurisdiction}</span></td>
       <td>${g.cabinet}</td><td class="num">${fmtUsd(g.daily_revenue_usd)}</td>
       <td class="num">${g.rtp.toFixed(4)}</td><td class="num">${(g.hit_freq * 100).toFixed(2)}%</td>
       <td class="num">${(g.error_rate * 100).toFixed(3)}%</td></tr>`,
    ).join('') + '</tbody></table>';
}

main().catch((e) => console.error(e));
