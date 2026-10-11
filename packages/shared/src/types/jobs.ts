/**
 * Jobs & Pricing Types
 * Extracted from printloop-new-frontend/src/store/services/jobsApi.ts
 */

export interface LegacyPricingMatrix {
  paperSize: "A4" | "A3";
  colorType: "bw" | "color";
  price100Simplex: number;
  price300Simplex: number;
  price600Simplex: number;
  price100Duplex: number;
  price300Duplex: number;
  price600Duplex: number;
}

export interface PrintJob {
  id: string;
  code: string;
  status: string;
  documentUrl: string | null;
  editedDocumentUrl: string | null;
  editingInstructions: string | null;
  totalPages: number;
  printConfiguration: any;
  createdAt: string;
  updatedAt: string;
  price: number;
  pages: number;
  copies: number;
  color: boolean;
  duplex: boolean;
  paperSize: string;
  dpi: number;
}

export interface JobListResponse {
  jobs: PrintJob[];
  total: number;
}

export interface CreateJobPayload {
  file: File;
  copies: number;
  color: boolean;
  duplex: boolean;
  paperSize: "A4" | "A3";
  dpi: number;
  pages: number;
  printConfiguration: any;
}

export interface CreateBatchJobPayload {
  files: File[];
  items: Array<{
    fileIndex: number;
    copies: number;
    color: boolean;
    duplex: boolean;
    paperSize: "A4" | "A3";
    dpi: number;
    pages: number;
    printConfiguration: any;
  }>;
}

export interface InitializeJobPaymentPayload {
  jobId: string;
}

export interface InitializeJobPaymentResponse {
  authorizationUrl: string;
  reference: string;
}

export interface UploadFileResponse {
  fileId: string;
  url: string;
}

export interface DisputePayload {
  printJobId: string;
  reason: string;
}

export interface DisputeResponse {
  id: string;
  status: string;
  createdAt: string;
}