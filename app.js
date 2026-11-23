import {
  assess, toMonthly, fmt, referenceTable, EXEMPT_CATEGORIES, EXEMPT_OCCUPATIONS, LAST_VERIFIED, SOURCES,
} from "./rules.js";

const $ = (id) => document.getElementById(id);
const form = $("form");
const today = new Date().toISOString().slice(0, 10);

for (const c of EXEMPT_CATEGORIES) $("category").add(new Option(c.label, c.id));
for (const o of EXEMPT_OCCUPATIONS) $("occupation").add(new Option(o, o));
$("date").value = today;
$("verified").textContent = LAST_VERIFIED;

// Restore state from the URL so results can be shared.
const params = new URLSearchParams(location.search);
if (params.has("s")) $("salary").value = params.get("s");
if (params.has("p")) form.period.value = params.get("p");
if (params.has("d")) $("date").value = params.get("d");
if (params.has("t")) form.type.value = params.get("t");
if (params.has("g")) $("granted").checked = params.get("g") === "1";
if (params.has("c")) $("category").value = params.get("c");
if (params.has("o")) $("occupation").value = params.get("o");

function readInput() {
  const salary = toMonthly($("salary").value || 0, form.period.value);
  return {
    monthlySalary: salary,
    applicationDate: $("date").value || today,
    type: form.type.value,
    currentPermitGrantedBefore1June: $("granted").checked,
    exemptCategory: $("category").value || null,
    exemptOccupation: $("occupation").value || null,
    blueCard: $("bc").checked ? { degreeOrExperience: $("bcDegree").checked, monthsOfContract: Number($("bcMonths").value) } : null,
  };
}

function renderMeter(r, ref) {
  const lines = [
    { key: "exempt", label: "75%", value: ref.exempt },
    { key: "transitional", label: "80%", value: ref.transitional },
    { key: "standard", label: "90%", value: ref.standard },
  ];
  const min = ref.median * 0.6;
  const max = Math.max(ref.median * 1.1, r.salary * 1.02);
  const pos = (v) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  $("bar").style.width = `${pos(r.salary)}%`;
  $("bar").style.background = r.meets ? "var(--good)" : "var(--bad)";
  const activeKey = r.rule.startsWith("exempt") ? "exempt" : r.rule;
  $("ticks").innerHTML = lines.map((l) =>
    `<div class="tick ${l.key === activeKey ? "active" : ""}" style="left:${pos(l.value)}%">${l.label}<br>${(l.value / 1000).toFixed(1)}k</div>`
  ).join("");
}

function render() {
  $("grantedWrap").hidden = form.type.value !== "extension";
  $("bcFields").hidden = !$("bc").checked;

  let r, ref;
  try {
    const input = readInput();
    r = assess(input);
    ref = referenceTable(input.applicationDate);
  } catch (err) {
    $("verdict").className = "verdict bad";
    $("verdict").innerHTML = `<div class="big">Can't check that date</div><div class="sub">${err.message}</div>`;
    return;
  }

  $("verdict").className = `verdict ${r.meets ? "good" : "bad"}`;
  $("verdict").innerHTML = r.meets
    ? `<div class="big">Meets the requirement</div><div class="sub">${fmt(r.margin)} above the ${fmt(r.threshold)} minimum.</div>`
    : `<div class="big">Below the requirement</div><div class="sub">You need ${fmt(-r.margin)} more per month to reach ${fmt(r.threshold)}.</div>`;

  renderMeter(r, ref);
  $("why").textContent = r.why;
  $("facts").innerHTML = `
    <dt>Your monthly salary</dt><dd>${fmt(r.salary)}</dd>
    <dt>Median salary used (SCB)</dt><dd>${fmt(r.median)}</dd>
    <dt>Rule applied</dt><dd>${Math.round(r.rate * 100)}% of median</dd>
    <dt>Minimum monthly salary</dt><dd>${fmt(r.threshold)}</dd>`;
  $("caveat").textContent = r.caveat;

  if (r.blueCard) {
    $("bcResult").hidden = false;
    $("bcResult").innerHTML = r.blueCard.eligible
      ? `<strong>EU Blue Card: looks eligible.</strong> Threshold ${fmt(r.blueCard.threshold)} per month. A Blue Card gives longer permits and easier moves within the EU.`
      : `<strong>EU Blue Card: not yet.</strong> Threshold ${fmt(r.blueCard.threshold)} per month.<ul>${r.blueCard.reasons.map((x) => `<li>${x}</li>`).join("")}</ul>`;
  } else {
    $("bcResult").hidden = true;
  }

  $("ref").innerHTML = `
    <tr><th>Who</th><th>Rule</th><th style="text-align:right">Minimum per month</th></tr>
    <tr><td>Most first time applicants</td><td>90% of median</td><td class="num">${fmt(ref.standard)}</td></tr>
    <tr><td>Exempted occupations, former students in Sweden, young tech and life science startups</td><td>75% of median</td><td class="num">${fmt(ref.exempt)}</td></tr>
    <tr><td>Extending a permit granted before 1 June 2026 (apply by 1 Dec 2026)</td><td>80% of median</td><td class="num">${fmt(ref.transitional)}</td></tr>
    <tr><td>EU Blue Card</td><td>1.25 × average salary</td><td class="num">${fmt(ref.blueCard)}</td></tr>
    <tr><td colspan="2" class="muted">Median salary (SCB) · <a href="${SOURCES.median}" rel="noopener">source</a></td><td class="num">${fmt(ref.median)}</td></tr>`;
}

$("share").addEventListener("click", async () => {
  const p = new URLSearchParams({
    s: $("salary").value, p: form.period.value, d: $("date").value, t: form.type.value,
    g: $("granted").checked ? "1" : "0", c: $("category").value, o: $("occupation").value,
  });
  const url = `${location.origin}${location.pathname}?${p}`;
  try { await navigator.clipboard.writeText(url); $("share").textContent = "Link copied"; }
  catch { history.replaceState(null, "", url); $("share").textContent = "Link is in the address bar"; }
  setTimeout(() => ($("share").textContent = "Copy link to this result"), 2000);
});

form.addEventListener("input", render);
form.addEventListener("change", render);
render();
