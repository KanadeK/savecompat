import type { CheckReport, Diagnostic, DiffChange, FileCheckResult } from "./types.js";

export function renderHtmlReport(report: CheckReport): string {
  const rows = report.files.map(renderFile).join("\n");
  const status = report.summary.failed === 0 ? "PASS" : "FAIL";
  const statusClass = report.summary.failed === 0 ? "pass" : "fail";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SaveCompat report · ${escapeHtml(status)}</title>
  <style>
    :root { color-scheme: dark; --bg:#0a0d12; --panel:#111722; --line:#273244; --text:#e8edf5; --muted:#9aa8ba; --pass:#55d6a0; --fail:#ff6b81; --accent:#72a7ff; }
    * { box-sizing:border-box; }
    body { margin:0; background:radial-gradient(circle at top,#152238 0,#0a0d12 38rem); color:var(--text); font:15px/1.55 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    main { width:min(1120px,calc(100% - 32px)); margin:48px auto 80px; }
    header { display:flex; gap:24px; align-items:flex-end; justify-content:space-between; margin-bottom:26px; }
    h1 { margin:0; font-size:clamp(32px,6vw,64px); letter-spacing:-.06em; }
    h1 span { color:var(--accent); }
    p { color:var(--muted); }
    code { font-family:ui-monospace,SFMono-Regular,Consolas,monospace; }
    .badge { border:1px solid currentColor; border-radius:999px; padding:8px 14px; font-weight:800; letter-spacing:.12em; }
    .pass { color:var(--pass); }
    .fail { color:var(--fail); }
    .cards { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; margin:24px 0; }
    .card,.file { background:color-mix(in srgb,var(--panel) 92%,transparent); border:1px solid var(--line); border-radius:16px; box-shadow:0 20px 60px #0005; }
    .card { padding:18px; }
    .card strong { display:block; font-size:30px; }
    .card span { color:var(--muted); font-size:13px; }
    .file { margin:12px 0; overflow:hidden; }
    summary { display:grid; grid-template-columns:110px 1fr auto auto; gap:14px; align-items:center; padding:17px 20px; cursor:pointer; }
    summary:hover { background:#ffffff06; }
    .status { font-weight:800; letter-spacing:.08em; }
    .meta { color:var(--muted); font-size:13px; }
    .content { border-top:1px solid var(--line); padding:18px 20px 22px; }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
    h2,h3 { margin:0 0 10px; }
    ul { margin:0; padding-left:20px; }
    li { margin:5px 0; overflow-wrap:anywhere; }
    .quiet { color:var(--muted); }
    .change-added { color:var(--pass); }
    .change-removed,.diagnostic-error { color:var(--fail); }
    .change-changed { color:#ffd166; }
    footer { margin-top:28px; color:var(--muted); text-align:center; font-size:13px; }
    @media (max-width:800px) { .cards { grid-template-columns:repeat(2,1fr); } summary { grid-template-columns:86px 1fr; } summary .meta { display:none; } .grid { grid-template-columns:1fr; } header { align-items:flex-start; flex-direction:column; } }
  </style>
</head>
<body>
<main>
  <header>
    <div>
      <h1>Save<span>Compat</span></h1>
      <p>Old-save compatibility report · target v${escapeHtml(report.latestVersion)}</p>
    </div>
    <div class="badge ${statusClass}">${status}</div>
  </header>
  <section class="cards">
    ${card(report.summary.total, "fixtures")}
    ${card(report.summary.passed, "passed")}
    ${card(report.summary.failed, "failed")}
    ${card(report.summary.migrated, "migrated")}
    ${card(`${report.summary.durationMs} ms`, "runtime")}
  </section>
  <section>
    ${rows || '<div class="file content quiet">No fixtures matched.</div>'}
  </section>
  <footer>Generated ${escapeHtml(report.generatedAt)} by SaveCompat v${escapeHtml(report.version)} · ${escapeHtml(report.configPath)}</footer>
</main>
</body>
</html>`;
}

function renderFile(file: FileCheckResult): string {
  const status = file.passed ? "PASS" : "FAIL";
  const statusClass = file.passed ? "pass" : "fail";
  const versions = `${file.sourceVersion ?? "?"} → ${file.targetVersion}`;
  const diagnostics =
    file.diagnostics.length === 0
      ? '<p class="quiet">No diagnostics.</p>'
      : `<ul>${file.diagnostics.map(renderDiagnostic).join("")}</ul>`;
  const changes =
    file.changes.length === 0
      ? '<p class="quiet">No semantic changes.</p>'
      : `<ul>${file.changes.slice(0, 100).map(renderChange).join("")}</ul>${file.changes.length > 100 ? `<p class="quiet">${file.changes.length - 100} more changes omitted.</p>` : ""}`;
  const steps =
    file.applied.length === 0
      ? "already current"
      : file.applied.map((step) => `${step.from}→${step.to}`).join(", ");

  return `<details class="file" ${file.passed ? "" : "open"}>
  <summary>
    <span class="status ${statusClass}">${status}</span>
    <code>${escapeHtml(file.file)}</code>
    <span class="meta">v${escapeHtml(versions)}</span>
    <span class="meta">${escapeHtml(String(file.durationMs))} ms</span>
  </summary>
  <div class="content grid">
    <div>
      <h3>Diagnostics</h3>
      ${diagnostics}
      <p class="meta">Migration: ${escapeHtml(steps)}</p>
    </div>
    <div>
      <h3>Semantic changes (${file.changes.length})</h3>
      ${changes}
    </div>
  </div>
</details>`;
}

function renderDiagnostic(diagnostic: Diagnostic): string {
  return `<li class="diagnostic-${escapeHtml(diagnostic.severity)}"><code>${escapeHtml(diagnostic.code)}</code> ${escapeHtml(diagnostic.message)}</li>`;
}

function renderChange(change: DiffChange): string {
  return `<li class="change-${change.kind}"><strong>${escapeHtml(change.kind)}</strong> <code>${escapeHtml(change.path)}</code></li>`;
}

function card(value: string | number, label: string): string {
  return `<div class="card"><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></div>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
