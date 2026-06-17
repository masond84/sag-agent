import { formatPullRequestMergeMessage, type PullRequestMergeResult } from "../core/dev/git.js";

const cases: Array<[number, PullRequestMergeResult, string]> = [
  [
    10,
    { merged: true, title: "Audit docs", wasDraft: false },
    "Merged PR #10: Audit docs",
  ],
  [
    9,
    { merged: true, title: "Draft note", wasDraft: true },
    "Merged PR #9: Draft note (was draft, marked ready)",
  ],
  [
    8,
    { merged: false, title: "Closed PR", wasDraft: false, failure: "not_open" },
    "PR #8 not open (Closed PR).",
  ],
  [
    7,
    { merged: false, title: "Draft PR", wasDraft: true, failure: "ready_failed" },
    "PR #7 not merged (Draft PR): could not mark draft ready.",
  ],
  [
    6,
    { merged: false, title: "Checks pending", wasDraft: true, failure: "merge_failed" },
    "PR #6 not merged (Checks pending) after marking ready.",
  ],
  [
    5,
    { merged: false, title: "Checks pending", wasDraft: false, failure: "merge_failed" },
    "PR #5 not merged (Checks pending).",
  ],
  [
    4,
    { merged: false, title: "PR #4", wasDraft: false, failure: "view_failed" },
    "PR #4 not merged: could not load PR details.",
  ],
];

for (const [prNumber, result, expected] of cases) {
  const actual = formatPullRequestMergeMessage(prNumber, result);
  if (actual !== expected) {
    console.error(`FAIL PR #${prNumber}`);
    console.error(`  expected: ${expected}`);
    console.error(`  actual:   ${actual}`);
    process.exit(1);
  }
}

console.log(`merge result messages ok (${cases.length} cases)`);
