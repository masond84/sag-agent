import { resolveSpeakableText } from "../core/house/speech-policy.js";

const devBrief = `SAG evolved (merged #40)

Linear: SAG-25 (https://linear.app/sag-house-agent/issue/SAG-25/implement-planned-skill-tree-perk-gmail-watch-branch-oauth-gmail)

Cursor agent: bc-5a7c610b-4c1a-4939-a577-9c985b84ce33 (finished)

### What changed
- \`config/skills/gmail-poll.yaml\`
- src/core/worker.ts`;

const cases: Array<{ label: string; text: string; meta?: Record<string, string | number | boolean>; expect: string | null }> = [
  {
    label: "dev merge brief",
    text: devBrief,
    meta: { source: "notification" },
    expect: null,
  },
  {
    label: "dev merge with override",
    text: devBrief,
    meta: { source: "notification", speechOverride: "SAG evolved." },
    expect: "SAG evolved.",
  },
  {
    label: "short telegram reply",
    text: "Hey Devin — focus block at 2 looks clear. Want me to nudge you then?",
    meta: { source: "telegram" },
    expect: "Hey Devin — focus block at 2 looks clear. Want me to nudge you then?",
  },
  {
    label: "long status dump",
    text: "/status output\nGmail: ok\nTelegram: ok\nSkills:\n- heartbeat\n- focus\n- dev-runner\n- reflection\n- conservice\n- gmail-poll\n- telegram",
    meta: { source: "telegram" },
    expect: null,
  },
  {
    label: "manual test speech",
    text: "House is online.",
    meta: { source: "manual" },
    expect: "House is online.",
  },
];

let failed = 0;
for (const test of cases) {
  const got = resolveSpeakableText(test.text, test.meta);
  const ok = got === test.expect;
  if (!ok) {
    failed += 1;
    console.error(`FAIL ${test.label}`);
    console.error(`  expected: ${JSON.stringify(test.expect)}`);
    console.error(`  got:      ${JSON.stringify(got)}`);
  } else {
    console.log(`ok   ${test.label}`);
  }
}

if (failed > 0) {
  process.exit(1);
}

console.log(`\nAll ${cases.length} speech policy checks passed.`);
