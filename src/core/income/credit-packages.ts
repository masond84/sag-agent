import type { CreditPackage } from "../../types.js";

export const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: "starter",
    name: "Starter",
    description: "Try the API with a small credit balance",
    priceUsd: 10,
    creditsUsd: 10,
  },
  {
    id: "growth",
    name: "Growth",
    description: "10% bonus credits for regular usage",
    priceUsd: 50,
    creditsUsd: 55,
  },
  {
    id: "pro",
    name: "Pro",
    description: "20% bonus credits for heavy usage",
    priceUsd: 100,
    creditsUsd: 120,
  },
];

export function getCreditPackage(packageId: string): CreditPackage | null {
  return CREDIT_PACKAGES.find((pkg) => pkg.id === packageId) ?? null;
}
