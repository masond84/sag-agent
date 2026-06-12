import { load } from "cheerio";
import type { ConserviceStatement, EmailMessage } from "../../types.js";

function extractPropertyName(subject: string): string | undefined {
  const match = subject.match(/Monthly Conservice Statement for (.+)$/i);
  return match?.[1]?.trim();
}

function extractFromPlainText(content: string): Partial<ConserviceStatement> {
  const dueDateMatch = content.match(/due on\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const accountMatch = content.match(/account number ending in\s+(\d+)/i);
  const totalMatch = content.match(/total current charges\s+\$(\d+\.\d{2})/i);

  return {
    dueDate: dueDateMatch?.[1],
    accountSuffix: accountMatch?.[1],
    totalCharge: totalMatch?.[1] ? `$${totalMatch[1]}` : undefined,
  };
}

function isSummaryRow(serviceType: string): boolean {
  return /current charges due|total current charges/i.test(serviceType);
}

function looksLikeCharge(value: string): boolean {
  return /^\$\d/.test(value);
}

function looksLikeDateRange(value: string): boolean {
  return /\d{1,2}\/\d{1,2}\/\d{4}/.test(value);
}

function extractLineItemsFromHtml(html: string): {
  lineItems: ConserviceStatement["lineItems"];
  totalCharge?: string;
} {
  const $ = load(html);
  const lineItems: ConserviceStatement["lineItems"] = [];
  let totalCharge: string | undefined;

  $("table tr").each((_, row) => {
    const cells = $(row)
      .find("td")
      .map((__, cell) => $(cell).text().replace(/\s+/g, " ").trim())
      .get();

    if (cells.length < 2) {
      return;
    }

    const [serviceType, secondCell, thirdCell] = cells;

    if (/service type|service period|charges/i.test(serviceType)) {
      return;
    }

    if (isSummaryRow(serviceType)) {
      if (thirdCell && looksLikeCharge(thirdCell)) {
        totalCharge = thirdCell;
      }
      return;
    }

    if (isSummaryRow(secondCell) && thirdCell && looksLikeCharge(thirdCell)) {
      totalCharge = thirdCell;
      return;
    }

    const charge = thirdCell && looksLikeCharge(thirdCell) ? thirdCell : undefined;
    const servicePeriod =
      secondCell && looksLikeDateRange(secondCell) ? secondCell : undefined;

    lineItems.push({
      serviceType,
      servicePeriod,
      charge,
    });
  });

  return { lineItems, totalCharge };
}

export function extractConserviceStatement(message: EmailMessage): ConserviceStatement | null {
  const content = message.html ?? message.text ?? "";
  if (!content.trim()) {
    return null;
  }

  const fromText = message.text ? extractFromPlainText(message.text) : {};
  const fromHtml = message.html ? extractFromPlainText(load(message.html).text()) : {};
  const tableData = message.html
    ? extractLineItemsFromHtml(message.html)
    : { lineItems: [], totalCharge: undefined };

  const statement: ConserviceStatement = {
    propertyName: extractPropertyName(message.subject),
    dueDate: fromText.dueDate ?? fromHtml.dueDate,
    accountSuffix: fromText.accountSuffix ?? fromHtml.accountSuffix,
    totalCharge: tableData.totalCharge ?? fromText.totalCharge ?? fromHtml.totalCharge,
    lineItems: tableData.lineItems,
  };

  if (!statement.dueDate && !statement.accountSuffix && statement.lineItems.length === 0) {
    return null;
  }

  return statement;
}

export function formatConserviceStatement(
  data: ConserviceStatement,
  prefix = "Conservice bill ready",
): string {
  const lines: string[] = [prefix];

  if (data.propertyName) {
    lines[0] = `${prefix} — ${data.propertyName}`;
  }

  const summaryParts: string[] = [];
  if (data.dueDate) {
    summaryParts.push(`Due: ${data.dueDate}`);
  }
  if (data.accountSuffix) {
    summaryParts.push(`Acct: ...${data.accountSuffix}`);
  }
  if (data.totalCharge) {
    summaryParts.push(`Total: ${data.totalCharge}`);
  }
  if (summaryParts.length > 0) {
    lines.push(summaryParts.join(" | "));
  }

  for (const item of data.lineItems) {
    const parts = [item.serviceType];
    if (item.servicePeriod) {
      parts.push(item.servicePeriod);
    }
    if (item.charge) {
      parts.push(item.charge);
    }
    lines.push(parts.join(" — "));
  }

  return lines.join("\n");
}
