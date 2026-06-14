const GREETING_PATTERN =
  /^(hey|hi|hello|yo|sup|howdy|good morning|good afternoon|good evening|morning|afternoon|evening)\b/i;

const SOCIAL_CHAT_PATTERN =
  /\b(bored|want to talk|just (chat|talking)|what's up|whats up|how are you|talk to you|keep me company)\b/i;

const AGENT_CAPABILITY_PATTERN =
  /\b(what (skills|can you|do you)|which skills?|your skills?|skills? (do you|can you|we|i)|what can you|what do you do|what are you|what is sag|who are you|capabilities|what.*\brun\b|list (your )?skills?|available skills?|what do you have access)\b/i;

const AGENT_STATUS_PATTERN =
  /\b(are you (online|alive|there|working|up)|is sag|sag (online|alive|healthy|working)|agent status|health audit|worker status)\b/i;

const DATA_QUERY_PATTERN =
  /\b(utility bill|conservice|my bill|last bill|bill history|focus today|today'?s focus|what was my)\b/i;

const CHECK_IN_REPLY_PATTERN =
  /^(good|fine|ok|okay|great|alright|done|finished|stuck|busy|bad|rough|meh|tired|great|yes|no|yep|nope|nah)\b|\b(stuck|blocked|on track|heads down|making progress|getting there|almost done|wrapped up|finished|overwhelm|struggling)\b|\b(don't bother|do not bother|leave me alone|not now|later)\b/i;

export function isGeneralConversation(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return true;
  }

  if (normalized.includes("?")) {
    return true;
  }

  return (
    GREETING_PATTERN.test(normalized) ||
    SOCIAL_CHAT_PATTERN.test(normalized) ||
    AGENT_CAPABILITY_PATTERN.test(normalized) ||
    AGENT_STATUS_PATTERN.test(normalized) ||
    DATA_QUERY_PATTERN.test(normalized)
  );
}

export function looksLikeCheckInReply(text: string): boolean {
  const normalized = text.trim();
  if (!normalized || isGeneralConversation(normalized)) {
    return false;
  }

  return CHECK_IN_REPLY_PATTERN.test(normalized);
}

export function shouldUseCheckInNudge(text: string, pendingSlot?: string): boolean {
  if (!pendingSlot) {
    return false;
  }

  return looksLikeCheckInReply(text);
}
