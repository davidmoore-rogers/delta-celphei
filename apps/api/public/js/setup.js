// Celphei setup wizard — vanilla JS, no framework.
// Mirrors Polaris's wizard pattern: in-memory state, no URL routing,
// atomic finalize at the end.

const TOTAL_STEPS = 8;
const SKIPPABLE_STEPS = new Set([4, 5, 6, 7]);

const STEP_LABELS = [
  "Database",
  "Admin",
  "App",
  "Org",
  "Polaris",
  "Directory",
  "Mail",
  "Review",
];

const state = {
  currentStep: 1,
  connectionTested: false,
  directoryTab: "entra",
};

document.addEventListener("DOMContentLoaded", init);

function init() {
  buildStepper();
  bindNav();
  bindActions();
  bindLiveValidation();
  bindTabs();
  bindSslToggle();
  fetchInitialSecrets();
  showStep(1);
}

function buildStepper() {
  const stepper = document.getElementById("stepper");
  STEP_LABELS.forEach((label, i) => {
    if (i > 0) {
      const line = document.createElement("li");
      line.className = "stepper-line";
      stepper.appendChild(line);
    }
    const step = document.createElement("li");
    step.className = "stepper-step";
    step.dataset.stepIndex = String(i + 1);
    step.innerHTML = `<span class="stepper-dot">${i + 1}</span><span>${label}</span>`;
    stepper.appendChild(step);
  });
}

function bindNav() {
  document.getElementById("btn-back").addEventListener("click", () => {
    if (state.currentStep > 1) showStep(state.currentStep - 1);
  });
  document.getElementById("btn-next").addEventListener("click", onNext);
  document.getElementById("btn-skip").addEventListener("click", onSkip);
  document.getElementById("btn-commit").addEventListener("click", onCommit);
}

function bindActions() {
  document.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.getAttribute("data-action");
      if (action === "test-connection") testDbConnection();
      else if (action === "regenerate-secrets") fetchInitialSecrets(true);
      else if (action === "test-polaris") testPolaris();
      else if (action === "test-directory") testDirectory();
      else if (action === "test-smtp") testSmtp();
    });
  });
}

function bindLiveValidation() {
  // Reset connectionTested on any DB field edit.
  document.querySelectorAll('[name^="db."]').forEach((el) => {
    el.addEventListener("input", () => {
      state.connectionTested = false;
      hideTestResult("db");
      updateNavButtons();
    });
  });
  // Live password rule checks.
  const pw = document.querySelector('[name="admin.password"]');
  const pwc = document.querySelector('[name="admin.passwordConfirm"]');
  [pw, pwc].forEach((el) =>
    el.addEventListener("input", () => {
      updatePasswordRules(pw.value, pwc.value);
      updateNavButtons();
    }),
  );
}

function bindTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const which = tab.dataset.tab;
      document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
      document.querySelectorAll("[data-tab-panel]").forEach((p) => {
        p.hidden = p.getAttribute("data-tab-panel") !== which;
      });
      state.directoryTab = which;
    });
  });
}

function bindSslToggle() {
  const sslBox = document.querySelector('[name="db.ssl"]');
  const child = document.querySelector("[data-ssl-only]");
  sslBox.addEventListener("change", () => {
    child.style.display = sslBox.checked ? "" : "none";
  });
}

async function fetchInitialSecrets(force) {
  const sessionEl = document.querySelector('[name="app.sessionSecret"]');
  if (!force && sessionEl.value) return;
  const r = await fetch("/api/setup/generate-secret", { method: "POST" });
  const j = await r.json();
  document.querySelector('[name="app.sessionSecret"]').value = j.sessionSecret;
  document.querySelector('[name="app.encryptionKey"]').value = j.encryptionKey;
  document.querySelector('[name="app.healthToken"]').value = j.healthToken;
  document.querySelector('[name="app.metricsToken"]').value = j.metricsToken;
}

function readDbInput() {
  return {
    host: val("db.host"),
    port: Number(val("db.port") || 5432),
    username: val("db.username"),
    password: val("db.password"),
    database: val("db.database"),
    ssl: checked("db.ssl"),
    sslAllowSelfSigned: checked("db.sslAllowSelfSigned"),
  };
}

async function testDbConnection() {
  const cfg = readDbInput();
  showTestResult("db", "Testing…", "info");
  try {
    const r = await fetch("/api/setup/test-connection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });
    const j = await r.json();
    if (j.ok) {
      const msg = `${j.message}${j.version ? ` (${j.version})` : ""}`;
      showTestResult("db", msg, "success");
      state.connectionTested = true;
    } else {
      showTestResult("db", j.message || "Test failed", "error");
      state.connectionTested = false;
    }
  } catch (err) {
    showTestResult("db", err.message, "error");
    state.connectionTested = false;
  }
  updateNavButtons();
}

async function testPolaris() {
  const baseUrl = val("polaris.baseUrl");
  const apiToken = val("polaris.apiToken");
  if (!baseUrl || !apiToken) {
    showTestResult("polaris", "Provide base URL and API token first", "error");
    return;
  }
  showTestResult("polaris", "Testing…", "info");
  const r = await fetch("/api/setup/test-polaris", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseUrl, apiToken }),
  });
  const j = await r.json();
  showTestResult("polaris", j.message, j.ok ? "success" : "error");
}

async function testDirectory() {
  const payload = collectDirectoryInput();
  if (!payload) {
    showTestResult("directory", "Fill in directory fields first", "error");
    return;
  }
  showTestResult("directory", "Testing…", "info");
  const r = await fetch("/api/setup/test-directory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = await r.json();
  showTestResult("directory", j.message, j.ok ? "success" : "error");
}

async function testSmtp() {
  const payload = collectMailInput();
  if (!payload) {
    showTestResult("mail", "Fill in SMTP fields first", "error");
    return;
  }
  showTestResult("mail", "Testing…", "info");
  const r = await fetch("/api/setup/test-smtp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = await r.json();
  showTestResult("mail", j.message, j.ok ? "success" : "error");
}

function onNext() {
  if (!canAdvance(state.currentStep)) return;
  if (state.currentStep === 7) {
    populateReview();
    showStep(8);
    return;
  }
  showStep(state.currentStep + 1);
}

function onSkip() {
  if (!SKIPPABLE_STEPS.has(state.currentStep)) return;
  // Clear values for the skipped step so finalize doesn't send them.
  clearStepFields(state.currentStep);
  if (state.currentStep === 7) {
    populateReview();
    showStep(8);
    return;
  }
  showStep(state.currentStep + 1);
}

async function onCommit() {
  const payload = collectFinalPayload();
  document.getElementById("btn-commit").disabled = true;
  showStep("finalize");
  setFinalizeStatus("Creating database and writing config…");
  let result;
  try {
    const r = await fetch("/api/setup/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    result = await r.json();
    if (!result.ok) throw new Error(result.message || "Setup failed");
  } catch (err) {
    setFinalizeStatus(`Error: ${err.message}`);
    document.getElementById("btn-commit").disabled = false;
    return;
  }
  setFinalizeStatus("Restarting application…");
  await pollForRestart(result.healthToken, payload.app.port);
}

async function pollForRestart(healthToken, port) {
  const url = `${window.location.protocol}//${window.location.hostname}:${port}/health`;
  for (let i = 0; i < 30; i++) {
    await delay(2000);
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${healthToken}` } });
      if (r.ok) {
        const j = await r.json();
        if (j.mode === "normal") {
          setFinalizeStatus("Setup complete. Redirecting to login…");
          await delay(800);
          window.location.href = `${window.location.protocol}//${window.location.hostname}:${port}/login`;
          return;
        }
      }
    } catch {
      // process still restarting
    }
  }
  setFinalizeStatus(
    `App did not come back online after 60s. Check container logs and visit http://${window.location.hostname}:${port}/ manually.`,
  );
}

function canAdvance(step) {
  if (step === 1) {
    return state.connectionTested && val("db.host") && val("db.username") && val("db.database");
  }
  if (step === 2) {
    const pw = val("admin.password");
    const pwc = val("admin.passwordConfirm");
    const email = val("admin.email");
    const display = val("admin.displayName");
    if (!email || !display) return false;
    if (pw !== pwc) return false;
    const rules = checkPasswordRules(pw);
    return rules.every((r) => r.met);
  }
  if (step === 3) {
    return val("app.sessionSecret").length >= 32 && val("app.encryptionKey").length >= 32;
  }
  return true; // 4–7 always advanceable (skippable too)
}

function showStep(step) {
  state.currentStep = step;
  document.querySelectorAll(".step-panel").forEach((panel) => {
    const s = panel.getAttribute("data-step");
    if (s === String(step) || (step === "finalize" && s === "finalize")) {
      panel.classList.add("visible");
      panel.hidden = false;
    } else {
      panel.classList.remove("visible");
      panel.hidden = true;
    }
  });
  updateStepper(typeof step === "number" ? step : TOTAL_STEPS);
  updateNavButtons();
}

function updateStepper(currentIndex) {
  document.querySelectorAll(".stepper-step").forEach((el) => {
    const idx = Number(el.dataset.stepIndex);
    el.classList.toggle("active", idx === currentIndex);
    el.classList.toggle("done", idx < currentIndex);
  });
  const lines = document.querySelectorAll(".stepper-line");
  lines.forEach((line, i) => {
    line.classList.toggle("done", i + 1 < currentIndex);
  });
}

function updateNavButtons() {
  const back = document.getElementById("btn-back");
  const skip = document.getElementById("btn-skip");
  const next = document.getElementById("btn-next");
  const commit = document.getElementById("btn-commit");
  const step = state.currentStep;

  if (step === "finalize") {
    back.hidden = skip.hidden = next.hidden = commit.hidden = true;
    return;
  }

  back.hidden = step === 1;
  skip.style.display = SKIPPABLE_STEPS.has(step) ? "" : "none";
  next.hidden = step === TOTAL_STEPS;
  commit.hidden = step !== TOTAL_STEPS;

  next.disabled = !canAdvance(step);
}

function showTestResult(which, message, kind) {
  const el = document.querySelector(`[data-test-result="${which}"]`);
  el.hidden = false;
  el.classList.remove("success", "error");
  if (kind === "success") el.classList.add("success");
  else if (kind === "error") el.classList.add("error");
  el.textContent = message;
}

function hideTestResult(which) {
  const el = document.querySelector(`[data-test-result="${which}"]`);
  el.hidden = true;
}

function checkPasswordRules(pw) {
  return [
    { rule: "min-length", met: pw.length >= 8 },
    { rule: "upper", met: /[A-Z]/.test(pw) },
    { rule: "lower", met: /[a-z]/.test(pw) },
    { rule: "number", met: /[0-9]/.test(pw) },
    { rule: "special", met: /[^A-Za-z0-9]/.test(pw) },
  ];
}

function updatePasswordRules(pw, pwc) {
  const rules = checkPasswordRules(pw);
  rules.forEach(({ rule, met }) => {
    const li = document.querySelector(`#pw-rules li[data-rule="${rule}"]`);
    li.classList.toggle("met", met);
    li.querySelector(".rule-icon").textContent = met ? "✓" : "○";
  });
  const matchLi = document.querySelector('#pw-rules li[data-rule="match"]');
  const matches = pw.length > 0 && pw === pwc;
  matchLi.classList.toggle("met", matches);
  matchLi.querySelector(".rule-icon").textContent = matches ? "✓" : "○";
}

function clearStepFields(step) {
  const sel = (k) => document.querySelectorAll(`[name^="${k}."]`);
  if (step === 4) sel("org").forEach((el) => (el.value = el.defaultValue));
  if (step === 5) sel("polaris").forEach((el) => (el.value = ""));
  if (step === 6) sel("directory").forEach((el) => (el.value = ""));
  if (step === 7) sel("mail").forEach((el) => (el.value = el.defaultValue));
}

function populateReview() {
  const grid = document.getElementById("review-grid");
  const items = [
    ["Database", `${val("db.username")}@${val("db.host")}:${val("db.port")}/${val("db.database")}${checked("db.ssl") ? " (SSL)" : ""}`],
    ["Admin", `${val("admin.displayName")} <${val("admin.email")}>`],
    ["HTTP port", val("app.port")],
    ["Session secret", maskTail(val("app.sessionSecret"))],
  ];
  if (val("org.orgName")) items.push(["Organization", val("org.orgName")]);
  if (val("polaris.baseUrl")) items.push(["Polaris", val("polaris.baseUrl")]);
  const dir = collectDirectoryInput();
  if (dir) items.push(["Directory", dir.kind === "entra" ? `Entra (${dir.tenantId})` : `LDAP (${dir.url})`]);
  if (val("mail.host")) items.push(["Mail", `${val("mail.host")}:${val("mail.port")} (${val("mail.from")})`]);

  grid.innerHTML = "";
  items.forEach(([k, v]) => {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = v;
    grid.appendChild(dt);
    grid.appendChild(dd);
  });
}

function collectFinalPayload() {
  const payload = {
    db: readDbInput(),
    admin: {
      email: val("admin.email"),
      displayName: val("admin.displayName"),
      password: val("admin.password"),
    },
    app: {
      port: Number(val("app.port")),
      sessionSecret: val("app.sessionSecret"),
      encryptionKey: val("app.encryptionKey"),
      healthToken: val("app.healthToken"),
      metricsToken: val("app.metricsToken"),
    },
  };
  if (val("org.orgName")) {
    payload.org = {
      orgName: val("org.orgName"),
      primaryColor: val("org.primaryColor") || "#4a9eff",
      loginBanner: val("org.loginBanner"),
      ticketPrefixes: {
        incident: val("org.ticketPrefixes.incident") || "INC",
        change: val("org.ticketPrefixes.change") || "CHG",
        request: val("org.ticketPrefixes.request") || "REQ",
      },
    };
  }
  if (val("polaris.baseUrl") && val("polaris.apiToken")) {
    payload.polaris = { baseUrl: val("polaris.baseUrl"), apiToken: val("polaris.apiToken") };
  }
  const dir = collectDirectoryInput();
  if (dir) payload.directory = dir;
  const mail = collectMailInput();
  if (mail) payload.mail = mail;
  return payload;
}

function collectDirectoryInput() {
  if (state.directoryTab === "entra") {
    const tenantId = val("directory.entra.tenantId");
    const clientId = val("directory.entra.clientId");
    const clientSecret = val("directory.entra.clientSecret");
    if (!tenantId || !clientId || !clientSecret) return null;
    return { kind: "entra", tenantId, clientId, clientSecret };
  }
  const url = val("directory.ldap.url");
  const bindDN = val("directory.ldap.bindDN");
  const bindPassword = val("directory.ldap.bindPassword");
  const userBase = val("directory.ldap.userBase");
  if (!url || !bindDN || !bindPassword || !userBase) return null;
  return {
    kind: "ldap",
    url,
    bindDN,
    bindPassword,
    userBase,
    userFilter: val("directory.ldap.userFilter") || "(objectClass=user)",
  };
}

function collectMailInput() {
  const host = val("mail.host");
  const from = val("mail.from");
  if (!host || !from) return null;
  return {
    host,
    port: Number(val("mail.port")) || 587,
    username: val("mail.username") || undefined,
    password: val("mail.password") || undefined,
    from,
    useTLS: checked("mail.useTLS"),
  };
}

function setFinalizeStatus(text) {
  document.getElementById("finalize-status").textContent = text;
}
function val(name) {
  const el = document.querySelector(`[name="${name}"]`);
  return el ? el.value.trim() : "";
}
function checked(name) {
  const el = document.querySelector(`[name="${name}"]`);
  return el ? !!el.checked : false;
}
function maskTail(s) {
  if (!s) return "";
  return s.length <= 8 ? "•".repeat(s.length) : `${s.slice(0, 4)}…${s.slice(-4)}`;
}
function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}
