import { PDFDocument } from "pdf-lib";
import type { ServiceUsage } from "../../types.js";
import { logServiceUsage } from "../../core/income/revenue-tracking.js";
import { getServiceConfig } from "../../core/income/service-config.js";

export interface PDFMergeRequest {
  files: Buffer[];
  metadata?: {
    title?: string;
    author?: string;
  };
}

export interface PDFSplitRequest {
  file: Buffer;
  pages?: number[];
  ranges?: Array<{ start: number; end: number }>;
}

export interface PDFCompressRequest {
  file: Buffer;
  quality?: "low" | "medium" | "high";
}

export async function mergePDFs(request: PDFMergeRequest, customerId?: string): Promise<Buffer> {
  const startTime = Date.now();
  const serviceConfig = await getServiceConfig("pdf-merge");
  
  if (!serviceConfig || !serviceConfig.enabled) {
    throw new Error("PDF merge service is not available");
  }
  
  try {
    const mergedPdf = await PDFDocument.create();
    let totalPages = 0;
    
    for (const fileBuffer of request.files) {
      const pdf = await PDFDocument.load(fileBuffer);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
      totalPages += pdf.getPageCount();
    }
    
    if (request.metadata?.title) {
      mergedPdf.setTitle(request.metadata.title);
    }
    if (request.metadata?.author) {
      mergedPdf.setAuthor(request.metadata.author);
    }
    
    const result = await mergedPdf.save();
    
    const revenue = totalPages * (serviceConfig.pricing.pricePerUnit || 0);
    const cost = totalPages * (serviceConfig.backend.costPerUnit || 0);
    
    await logServiceUsage({
      timestamp: new Date().toISOString(),
      serviceId: "pdf-merge",
      units: totalPages,
      revenue,
      cost,
      profit: revenue - cost,
      customerId,
      success: true,
    });
    
    return Buffer.from(result);
  } catch (error) {
    await logServiceUsage({
      timestamp: new Date().toISOString(),
      serviceId: "pdf-merge",
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

export async function splitPDF(request: PDFSplitRequest, customerId?: string): Promise<Buffer[]> {
  const serviceConfig = await getServiceConfig("pdf-split");
  
  if (!serviceConfig || !serviceConfig.enabled) {
    throw new Error("PDF split service is not available");
  }
  
  try {
    const pdf = await PDFDocument.load(request.file);
    const results: Buffer[] = [];
    
    const pagesToExtract = request.pages || pdf.getPageIndices();
    
    for (const pageIndex of pagesToExtract) {
      const newPdf = await PDFDocument.create();
      const [copiedPage] = await newPdf.copyPages(pdf, [pageIndex]);
      newPdf.addPage(copiedPage);
      const pdfBytes = await newPdf.save();
      results.push(Buffer.from(pdfBytes));
    }
    
    const revenue = pagesToExtract.length * (serviceConfig.pricing.pricePerUnit || 0);
    const cost = pagesToExtract.length * (serviceConfig.backend.costPerUnit || 0);
    
    await logServiceUsage({
      timestamp: new Date().toISOString(),
      serviceId: "pdf-split",
      units: pagesToExtract.length,
      revenue,
      cost,
      profit: revenue - cost,
      customerId,
      success: true,
    });
    
    return results;
  } catch (error) {
    await logServiceUsage({
      timestamp: new Date().toISOString(),
      serviceId: "pdf-split",
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

export async function compressPDF(request: PDFCompressRequest, customerId?: string): Promise<Buffer> {
  const serviceConfig = await getServiceConfig("pdf-compress");
  
  if (!serviceConfig || !serviceConfig.enabled) {
    throw new Error("PDF compress service is not available");
  }
  
  try {
    const pdf = await PDFDocument.load(request.file);
    
    const compressedBytes = await pdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: 50,
    });
    
    const revenue = serviceConfig.pricing.pricePerCall || 0;
    const cost = serviceConfig.backend.costPerUnit || 0;
    
    await logServiceUsage({
      timestamp: new Date().toISOString(),
      serviceId: "pdf-compress",
      units: 1,
      revenue,
      cost,
      profit: revenue - cost,
      customerId,
      success: true,
    });
    
    return Buffer.from(compressedBytes);
  } catch (error) {
    await logServiceUsage({
      timestamp: new Date().toISOString(),
      serviceId: "pdf-compress",
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
