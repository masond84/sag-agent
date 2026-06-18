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
  /^(good|fine|ok|okay|great|alright|done|finished|stuck|busy|bad|rough|meh|tired|yes|no|yep|nope|nah)\b|\b(stuck|blocked|on track|heads down|making progress|getting there|almost done|wrapped up|finished|overwhelm|struggling)\b/i;

const DEV_TASK_PATTERN =
  /\b(update (your|the|my) code|change (your|the) (code|prompt|personality|copy)|implement (this|it)|modify (your|the)|fix (your|the)|self.?modif|make you (real|more)|stop saying you'?re (a )?virtual|remove disclaimers?|\/dev\b)/i;

const SELF_IMPROVEMENT_DEV_PATTERN =
  /\b(make yourself better|improve yourself|learn from (?:our|the|past|recent)|based on (?:our|the|past|recent) (?:conversation|interaction|chat)s?|update yourself|better based on|try to make yourself)\b/i;

const SHORT_DEV_AFFIRMATION_PATTERN =
  /^(?:yes[,!\s]*)?(?:please\s*)?(?:go ahead(?:[,!\s]*and)?[,!\s]*)?(?:sure[,!\s]*)?(?:ok(?:ay)?[,!\s]*)?(?:yep[,!\s]*)?(?:(?:sounds good|that works)(?:[,!\s]*(?:do (?:it|so)|please))?|do (?:it|so)|go for it|please do that|make it (?:so|happen))[\s.!]*$/i;

const DEV_PROPOSAL_CONTEXT_PATTERN =
  /\b(update (?:your|the|my) code|change (?:your|the) (?:code|prompt|personality|copy)|implement|modify|fix (?:your|the)|persona|make you|stop saying|remove disclaim|improve|better|proposal|pull request|\bpr\b|\/dev|want me to|shall i|i can (?:update|change|fix|add))\b/i;

const VAGUE_DEV_CONFIRMATION_PATTERN =
  /^(?:yes[,!\s]*)?(?:please\s*)?(?:go ahead(?:[,!\s]*and)?[,!\s]*)?(?:sure[,!\s]*)?(?:ok(?:ay)?[,!\s]*)?(?:yep[,!\s]*)?(?:update (?:your|the|my) code|change (?:your|the) (?:code|prompt|personality|copy)|implement (?:this|it)|modify (?:your|the)|fix (?:your|the)|make you (?:real|more)|stop saying you'?re (?:a )?virtual|remove disclaimers?|(?:(?:sounds good|that works)(?:[,!\s]*(?:do (?:it|so)|please))?|do (?:it|so)|go for it|please do that|make it (?:so|happen)))(?:\s+(?:to\s+)?do so)?[\s.!]*$/i;

export function isDevTaskRequest(text: string): boolean {
  const normalized = text.trim();
  return DEV_TASK_PATTERN.test(normalized) || SELF_IMPROVEMENT_DEV_PATTERN.test(normalized);
}

export function isShortDevAffirmation(text: string): boolean {
  const normalized = text.trim();
  if (!normalized || normalized.length > 80) {
    return false;
  }

  return (
    SHORT_DEV_AFFIRMATION_PATTERN.test(normalized) ||
    /^(yes|yep|sure|ok|okay|do it|sounds good|go for it)[\s.!]*$/i.test(normalized)
  );
}

export function threadLooksLikeDevProposal(threadHighlights: string): boolean {
  if (threadHighlights === "No prior conversation in this thread.") {
    return false;
  }

  return DEV_PROPOSAL_CONTEXT_PATTERN.test(threadHighlights);
}

export function isDevFollowUp(text: string, threadHighlights: string): boolean {
  return isShortDevAffirmation(text) && threadLooksLikeDevProposal(threadHighlights);
}

export function isVagueDevConfirmation(task: string): boolean {
  const normalized = task.trim();
  if (!normalized || normalized.length > 180) {
    return false;
  }

  return VAGUE_DEV_CONFIRMATION_PATTERN.test(normalized);
}

export function extractDevTask(text: string): string {
  const trimmed = text.trim();
  const devRun = trimmed.match(/^\/dev\s+run\s+(.+)/is);
  if (devRun?.[1]) return devRun[1].trim();
  return trimmed
    .replace(/\/?dev\s+(please\s+)?(run\s+|implement\s+)?/gi, "")
    .replace(/^(you are real\.?\s*)/i, "")
    .trim() || trimmed;
}

export function isGeneralConversation(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return true;
  }

  if (normalized.includes("?")) {
    return true;
  }

  if (isDevTaskRequest(normalized)) {
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
