/**
 * Pricing Types
 * Extracted from printloop-new-frontend/src/lib/pricing.ts
 */

export type PaperSize = "A4" | "A3";
export type ColorType = "bw" | "color";
export type Dpi = 100 | 300 | 600;
export type Sides = "simplex" | "duplex";

export interface PricingCell {
  paperSize: PaperSize;
  colorType: ColorType;
  dpi: Dpi;
  sides: Sides;
  pricePerPage: number;
}

export interface PricingMatrix {
  [key: string]: PricingCell;
}

export interface PricingConfig {
  id: string;
  tenantId: string;
  matrix: PricingMatrix;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface PricingConfigResponse {
  config: PricingConfig;
}

/**
 * Calculate price for a print job
 */
export function calculatePrintPrice(
  matrix: PricingMatrix,
  options: {
    paperSize: PaperSize;
    colorType: ColorType;
    dpi: Dpi;
    sides: Sides;
    pages: number;
    copies: number;
  }
): number {
  const key = `${options.paperSize}_${options.colorType}_${options.dpi}_${options.sides}`;
  const cell = matrix[key];
  if (!cell) {
    throw new Error(`No pricing found for configuration: ${key}`);
  }
  return cell.pricePerPage * options.pages * options.copies;
}

/**
 * Default pricing matrix (NGN)
 */
export const DEFAULT_PRICING_MATRIX: PricingMatrix = {
  A4_bw_100_simplex: { paperSize: "A4", colorType: "bw", dpi: 100, sides: "simplex", pricePerPage: 5 },
  A4_bw_300_simplex: { paperSize: "A4", colorType: "bw", dpi: 300, sides: "simplex", pricePerPage: 5 },
  A4_bw_600_simplex: { paperSize: "A4", colorType: "bw", dpi: 600, sides: "simplex", pricePerPage: 5 },
  A4_bw_100_duplex: { paperSize: "A4", colorType: "bw", dpi: 100, sides: "duplex", pricePerPage: 8 },
  A4_bw_300_duplex: { paperSize: "A4", colorType: "bw", dpi: 300, sides: "duplex", pricePerPage: 8 },
  A4_bw_600_duplex: { paperSize: "A4", colorType: "bw", dpi: 600, sides: "duplex", pricePerPage: 8 },
  A4_color_100_simplex: { paperSize: "A4", colorType: "color", dpi: 100, sides: "simplex", pricePerPage: 25 },
  A4_color_300_simplex: { paperSize: "A4", colorType: "color", dpi: 300, sides: "simplex", pricePerPage: 25 },
  A4_color_600_simplex: { paperSize: "A4", colorType: "color", dpi: 600, sides: "simplex", pricePerPage: 25 },
  A4_color_100_duplex: { paperSize: "A4", colorType: "color", dpi: 100, sides: "duplex", pricePerPage: 40 },
  A4_color_300_duplex: { paperSize: "A4", colorType: "color", dpi: 300, sides: "duplex", pricePerPage: 40 },
  A4_color_600_duplex: { paperSize: "A4", colorType: "color", dpi: 600, sides: "duplex", pricePerPage: 40 },
  A3_bw_100_simplex: { paperSize: "A3", colorType: "bw", dpi: 100, sides: "simplex", pricePerPage: 10 },
  A3_bw_300_simplex: { paperSize: "A3", colorType: "bw", dpi: 300, sides: "simplex", pricePerPage: 10 },
  A3_bw_600_simplex: { paperSize: "A3", colorType: "bw", dpi: 600, sides: "simplex", pricePerPage: 10 },
  A3_bw_100_duplex: { paperSize: "A3", colorType: "bw", dpi: 100, sides: "duplex", pricePerPage: 16 },
  A3_bw_300_duplex: { paperSize: "A3", colorType: "bw", dpi: 300, sides: "duplex", pricePerPage: 16 },
  A3_bw_600_duplex: { paperSize: "A3", colorType: "bw", dpi: 600, sides: "duplex", pricePerPage: 16 },
  A3_color_100_simplex: { paperSize: "A3", colorType: "color", dpi: 100, sides: "simplex", pricePerPage: 50 },
  A3_color_300_simplex: { paperSize: "A3", colorType: "color", dpi: 300, sides: "simplex", pricePerPage: 50 },
  A3_color_600_simplex: { paperSize: "A3", colorType: "color", dpi: 600, sides: "simplex", pricePerPage: 50 },
  A3_color_100_duplex: { paperSize: "A3", colorType: "color", dpi: 100, sides: "duplex", pricePerPage: 80 },
  A3_color_300_duplex: { paperSize: "A3", colorType: "color", dpi: 300, sides: "duplex", pricePerPage: 80 },
  A3_color_600_duplex: { paperSize: "A3", colorType: "color", dpi: 600, sides: "duplex", pricePerPage: 80 },
};