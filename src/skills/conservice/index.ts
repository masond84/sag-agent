import type { EmailMessage, EmailSkill } from "../../types.js";
import { extractConserviceStatement, formatConserviceStatement } from "./extract.js";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function isConserviceSender(from: string): boolean {
  return from.includes("conservicemail.com") || from.includes("conservice.com");
}

export const conserviceSkill: EmailSkill = {
  kind: "email",
  config: {
    id: "conservice-statement",
    name: "Conservice Statement",
    enabled: true,
    kind: "email",
    trigger: {
      from: "ebill@conservicemail.com",
      subjectContains: "Monthly Conservice Statement",
      gmailQuery: 'from:conservicemail.com subject:"Monthly Conservice Statement"',
    },
  },
  matches(message: EmailMessage): boolean {
    const from = normalize(message.from);
    const subject = normalize(message.subject);

    return isConserviceSender(from) && subject.includes("monthly conservice statement");
  },
  extract(message: EmailMessage) {
    return extractConserviceStatement(message);
  },
  format(data) {
    return formatConserviceStatement(data, "Conservice bill ready");
  },
};
