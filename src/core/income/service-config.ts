import { promises as fs } from "node:fs";
import path from "node:path";
import type { ServiceConfig } from "../types.js";

const CONFIG_FILE = path.join(process.cwd(), "data", "income-services", "services.json");

const DEFAULT_SERVICES: ServiceConfig[] = [
  {
    id: "pdf-merge",
    name: "PDF Merge",
    description: "Combine multiple PDF files into a single document",
    enabled: true,
    pricing: {
      model: "per_unit",
      unit: "page",
      pricePerUnit: 0.10,
    },
    backend: {
      type: "local",
      costPerUnit: 0.001,
    },
    limits: {
      maxPages: 1000,
      rateLimit: 100,
    },
  },
  {
    id: "pdf-split",
    name: "PDF Split",
    description: "Split a PDF into individual pages or ranges",
    enabled: true,
    pricing: {
      model: "per_unit",
      unit: "page",
      pricePerUnit: 0.05,
    },
    backend: {
      type: "local",
      costPerUnit: 0.001,
    },
    limits: {
      maxPages: 1000,
      rateLimit: 100,
    },
  },
  {
    id: "pdf-compress",
    name: "PDF Compress",
    description: "Reduce PDF file size while maintaining quality",
    enabled: true,
    pricing: {
      model: "per_call",
      pricePerCall: 0.25,
    },
    backend: {
      type: "local",
      costPerUnit: 0.01,
    },
    limits: {
      maxSize: 50 * 1024 * 1024,
      rateLimit: 50,
    },
  },
  {
    id: "markdown-to-pdf",
    name: "Markdown to PDF",
    description: "Convert Markdown files to beautifully formatted PDFs",
    enabled: true,
    pricing: {
      model: "per_call",
      pricePerCall: 0.15,
    },
    backend: {
      type: "local",
      costPerUnit: 0.005,
    },
    limits: {
      maxSize: 5 * 1024 * 1024,
      rateLimit: 100,
    },
  },
  {
    id: "image-optimize",
    name: "Image Optimization",
    description: "Compress and optimize images for web",
    enabled: true,
    pricing: {
      model: "per_unit",
      unit: "image",
      pricePerUnit: 0.01,
    },
    backend: {
      type: "local",
      costPerUnit: 0.0001,
    },
    limits: {
      maxSize: 20 * 1024 * 1024,
      rateLimit: 200,
    },
  },
  {
    id: "translation",
    name: "Translation API",
    description: "High-quality text translation powered by DeepL",
    enabled: false,
    pricing: {
      model: "per_unit",
      unit: "character",
      pricePerUnit: 0.000015,
    },
    backend: {
      type: "api_proxy",
      apiProvider: "deepl",
      costPerUnit: 0.000005,
    },
    limits: {
      rateLimit: 100,
    },
  },
];

export async function loadServiceConfigs(): Promise<ServiceConfig[]> {
  try {
    const content = await fs.readFile(CONFIG_FILE, "utf-8");
    return JSON.parse(content) as ServiceConfig[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true });
      await fs.writeFile(CONFIG_FILE, JSON.stringify(DEFAULT_SERVICES, null, 2));
      return DEFAULT_SERVICES;
    }
    throw error;
  }
}

export async function getServiceConfig(serviceId: string): Promise<ServiceConfig | null> {
  const configs = await loadServiceConfigs();
  return configs.find(c => c.id === serviceId) || null;
}

export async function updateServiceConfig(serviceId: string, updates: Partial<ServiceConfig>): Promise<void> {
  const configs = await loadServiceConfigs();
  const index = configs.findIndex(c => c.id === serviceId);
  
  if (index === -1) {
    throw new Error(`Service ${serviceId} not found`);
  }
  
  configs[index] = { ...configs[index], ...updates };
  await fs.writeFile(CONFIG_FILE, JSON.stringify(configs, null, 2));
}

export async function getEnabledServices(): Promise<ServiceConfig[]> {
  const configs = await loadServiceConfigs();
  return configs.filter(c => c.enabled);
}
