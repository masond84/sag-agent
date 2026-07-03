import sharp from "sharp";
import { logServiceUsage } from "../revenue-tracking.js";
import { getServiceConfig } from "../service-config.js";

export interface ImageOptimizeRequest {
  file: Buffer;
  format?: "jpeg" | "png" | "webp";
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
}

export async function optimizeImage(
  request: ImageOptimizeRequest,
  customerId?: string,
): Promise<{ data: Buffer; format: string; width: number; height: number }> {
  const serviceConfig = await getServiceConfig("image-optimize");

  if (!serviceConfig || !serviceConfig.enabled) {
    throw new Error("Image optimization service is not available");
  }

  const maxSize = serviceConfig.limits?.maxSize ?? 20 * 1024 * 1024;
  if (request.file.length > maxSize) {
    throw new Error(`Image exceeds maximum size of ${Math.round(maxSize / 1024 / 1024)}MB`);
  }

  try {
    const quality = Math.min(100, Math.max(1, request.quality ?? 80));
    const maxWidth = request.maxWidth ?? 2048;
    const maxHeight = request.maxHeight ?? 2048;

    let pipeline = sharp(request.file).rotate().resize(maxWidth, maxHeight, {
      fit: "inside",
      withoutEnlargement: true,
    });

    const metadata = await sharp(request.file).metadata();
    const outputFormat = request.format ?? (metadata.format === "png" ? "png" : "jpeg");

    if (outputFormat === "webp") {
      pipeline = pipeline.webp({ quality });
    } else if (outputFormat === "png") {
      pipeline = pipeline.png({ compressionLevel: 9 });
    } else {
      pipeline = pipeline.jpeg({ quality, mozjpeg: true });
    }

    const result = await pipeline.toBuffer({ resolveWithObject: true });

    const revenue = (serviceConfig.pricing.pricePerUnit ?? 0.01) * 1;
    const cost = serviceConfig.backend.costPerUnit ?? 0.0001;

    await logServiceUsage({
      timestamp: new Date().toISOString(),
      serviceId: "image-optimize",
      units: 1,
      revenue,
      cost,
      profit: revenue - cost,
      customerId,
      success: true,
    });

    return {
      data: result.data,
      format: outputFormat,
      width: result.info.width,
      height: result.info.height,
    };
  } catch (error) {
    await logServiceUsage({
      timestamp: new Date().toISOString(),
      serviceId: "image-optimize",
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
