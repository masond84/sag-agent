import { marked } from "marked";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { ServiceUsage } from "../../../types.js";
import { logAndChargeServiceUsage } from "../revenue-tracking.js";
import { getServiceConfig } from "../service-config.js";

export interface MarkdownToPDFRequest {
  markdown: string;
  options?: {
    title?: string;
    author?: string;
    fontSize?: number;
    pageSize?: "letter" | "a4";
  };
}

export async function markdownToPDF(request: MarkdownToPDFRequest, customerId?: string): Promise<Buffer> {
  const serviceConfig = await getServiceConfig("markdown-to-pdf");
  
  if (!serviceConfig || !serviceConfig.enabled) {
    throw new Error("Markdown to PDF service is not available");
  }
  
  try {
    const html = await marked(request.markdown);
    
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    const pageWidth = request.options?.pageSize === "a4" ? 595 : 612;
    const pageHeight = request.options?.pageSize === "a4" ? 842 : 792;
    const fontSize = request.options?.fontSize || 12;
    const margin = 50;
    
    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let yPosition = pageHeight - margin;
    
    const lines = request.markdown.split("\n");
    
    for (const line of lines) {
      if (yPosition < margin + fontSize) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        yPosition = pageHeight - margin;
      }
      
      const isHeading = line.startsWith("#");
      const currentFont = isHeading ? boldFont : font;
      const currentSize = isHeading ? fontSize + 4 : fontSize;
      const text = line.replace(/^#+\s*/, "").trim();
      
      if (text) {
        page.drawText(text, {
          x: margin,
          y: yPosition,
          size: currentSize,
          font: currentFont,
          color: rgb(0, 0, 0),
        });
      }
      
      yPosition -= currentSize + 4;
    }
    
    if (request.options?.title) {
      pdfDoc.setTitle(request.options.title);
    }
    if (request.options?.author) {
      pdfDoc.setAuthor(request.options.author);
    }
    
    const pdfBytes = await pdfDoc.save();
    
    const revenue = serviceConfig.pricing.pricePerCall || 0;
    const cost = serviceConfig.backend.costPerUnit || 0;
    
    await logAndChargeServiceUsage({
      timestamp: new Date().toISOString(),
      serviceId: "markdown-to-pdf",
      units: 1,
      revenue,
      cost,
      profit: revenue - cost,
      customerId,
      success: true,
    });
    
    return Buffer.from(pdfBytes);
  } catch (error) {
    await logAndChargeServiceUsage({
      timestamp: new Date().toISOString(),
      serviceId: "markdown-to-pdf",
      units: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
      customerId,
      success: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
