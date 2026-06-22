/** Short hover copy — condensed wording, no truncation. */
const TOOLTIP_BY_NODE: Record<string, string> = {
  "comp-root": "Co-conspirator check-ins, not a help desk.",
  "comp-focus": "Focus pings at 8am, 1pm, and 9pm.",
  "comp-life": "Random personal texts, separate from work nudges.",
  "comp-morning": "Morning briefing at your configured time.",
  "comp-voice": "Read-aloud replies for voice and House TTS.",
  "mem-root": "Activity log of what SAG did and when.",
  "mem-user": "Mem0 memories about you from /remember.",
  "mem-agent": "SAG diary distilled from the activity log.",
  "mem-activity": "Recent activity in chat recall and live feed.",
  "mem-persona": "Co-created tone and personality over time.",
  "com-root": "Telegram chat, slash commands, and tools.",
  "com-tools": "Bills, focus, status, memories on demand.",
  "com-voice-hw": "Short plain-text replies, no markdown.",
  "com-house": "This web home: skill tree, feed, presence.",
  "mon-root": "Daily heartbeat and recovery after downtime.",
  "mon-gmail": "Gmail polling for email-triggered skills.",
  "mon-bills": "Conservice statements to Telegram.",
  "mon-health": "/status audit for Gmail, Telegram, worker.",
  "evo-root": "Scheduled self-audit via dev runner.",
  "evo-linear": "Work tracked as scoped Linear issues.",
  "evo-cloud": "Cursor Cloud implements changes and opens PRs.",
  "evo-merge": "Auto-merge PRs when checks pass.",
};

export function tooltipCopy(nodeId: string, fallbackDescription: string): string {
  return TOOLTIP_BY_NODE[nodeId] ?? condenseFallback(fallbackDescription);
}

function condenseFallback(text: string): string {
  const parts = text.split(" — ");
  if (parts.length > 1 && parts[0].length >= 24) {
    return parts[0].trim();
  }
  return text
    .replace(/\s+/g, " ")
    .replace(/Ground-truth /i, "")
    .replace(/configured /i, "")
    .trim();
}
