// Bridge from block 1 to block 2: converts an experiment recorded by the H Company explorer (h-explorer/, EXP_xxx.json:
// inputs, observed_output, status, evidence.actions, screenshots) into a ReBorn run (contracts/run.schema.json).
// The values the agent read on screen become runtime evidence that can confirm rules and fill acceptance scenarios.

const ACTION = [
  [/^(click|double_click|right_click)/i, (m) => m[1].toLowerCase()],
  [/^(type|fill|input)/i, () => "type"],
  [/^(press|key)/i, () => "key"],
  [/^scroll/i, () => "scroll"],
  [/^(goto|navigate|open)/i, () => "navigate"],
  [/^(wait|sleep)/i, () => "wait"],
  [/^(screenshot)/i, () => "screenshot"],
  [/^(read|get_text|extract)/i, () => "read"],
];
function actionType(s) {
  for (const [re, f] of ACTION) { const m = re.exec(String(s)); if (m) return f(m); }
  return "other";
}

// The agent's action log records what it typed, a login password included. Text typed into a password field, and any
// value known to be secret, is masked before the run (tracked by git) is written.
export function sanitizeAction(action, secrets = []) {
  let s = String(action);
  if (/password|mot de passe|passwd|pwd/i.test(s)) s = s.replace(/("text"\s*:\s*")([^"]*)(")/g, "$1***$3");
  for (const v of secrets) if (v && v.length >= 6) s = s.split(v).join("***");
  return s;
}

export function experimentToRun(exp, { target, mission, rawName, secrets = [] }) {
  const stamp = String(exp.timestamp || new Date().toISOString()).replace(/[-:]/g, "").replace(/\..+|\+.+/, "");
  const id = `run-${stamp}-h-${String(exp.experiment_id || "exp").replace(/[^A-Za-z0-9._-]/g, "-")}`;
  const end = exp.timestamp ? new Date(exp.timestamp) : new Date();
  const start = new Date(end.getTime() - Math.round(Number(exp.duration_s || 0) * 1000));
  const actions = exp.evidence?.actions ?? [];
  const shots = exp.evidence?.screenshots ?? [];
  const steps = actions.map((a, i) => ({ n: i + 1, action: { type: actionType(a), target_desc: sanitizeAction(a, secrets).slice(0, 300) }, ...(shots[i] ? { screenshot: String(shots[i]).split(/[\\/]/).pop() } : {}) }));
  const failed = exp.status === "failed";
  steps.push({
    n: steps.length + 1,
    action: { type: "read", target_desc: `values shown by the application (${exp.module || "module"})` },
    ...(exp.evidence?.final_screenshot ? { screenshot: String(exp.evidence.final_screenshot).split(/[\\/]/).pop() } : {}),
    observation: failed ? `the agent could not complete the experiment: ${exp.error ?? "unknown error"}` : exp.app_error ? `the application showed an error: ${typeof exp.app_error === "string" ? exp.app_error : JSON.stringify(exp.app_error)}` : (exp.observed_output?.status_message ?? "values read on screen"),
    ...(failed ? {} : { extracted: JSON.parse(sanitizeAction(JSON.stringify({ inputs: exp.inputs ?? {}, ...(exp.observed_output ?? {}) }), secrets)) }),
  });
  return {
    id,
    mission,
    subject: "original",
    agent: { provider: "h-company", product: "agents-api", ...(exp.agent_config?.model ? { model: exp.agent_config.model } : {}), ...(rawName ? { raw_output: rawName } : {}) },
    target: { id: target, environment: [exp.application, exp.module].filter(Boolean).join(" / ") || "web application" },
    started_at: start.toISOString(),
    ended_at: end.toISOString(),
    outcome: failed ? "failed" : (exp.attempt_errors?.length ? "partial" : "success"),
    steps,
    notes: [exp.agent_view_url ? `Agent view: ${exp.agent_view_url}` : "", exp.attempts ? `attempts: ${exp.attempts}` : "", exp.external_context?.provider ? "External web context was attached by the explorer; it validates nothing." : ""].filter(Boolean).join(" "),
  };
}
