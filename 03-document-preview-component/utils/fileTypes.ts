/**
 * Supported file types for print preview.
 * Matches the formats supported by @iamjariwala/react-doc-viewer.
 */

export const SUPPORTED_MIME_TYPES = {
  // PDF
  "application/pdf": { ext: "pdf", label: "PDF Document" },

  // Images
  "image/jpeg": { ext: "jpg", label: "JPEG Image" },
  "image/png": { ext: "png", label: "PNG Image" },
  "image/gif": { ext: "gif", label: "GIF Image" },
  "image/webp": { ext: "webp", label: "WebP Image" },
  "image/bmp": { ext: "bmp", label: "Bitmap Image" },
  "image/tiff": { ext: "tiff", label: "TIFF Image" },

  // Office documents
  "application/msword": { ext: "doc", label: "Word Document (Legacy)" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    ext: "docx",
    label: "Word Document",
  },
  "application/vnd.ms-excel": { ext: "xls", label: "Excel Spreadsheet (Legacy)" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    ext: "xlsx",
    label: "Excel Spreadsheet",
  },
  "application/vnd.ms-powerpoint": { ext: "ppt", label: "PowerPoint (Legacy)" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    ext: "pptx",
    label: "PowerPoint Presentation",
  },

  // OpenDocument
  "application/vnd.oasis.opendocument.text": { ext: "odt", label: "OpenDocument Text" },

  // Text formats
  "text/plain": { ext: "txt", label: "Plain Text" },
  "text/csv": { ext: "csv", label: "CSV File" },
  "text/html": { ext: "html", label: "HTML File" },
  "text/markdown": { ext: "md", label: "Markdown File" },
  "application/rtf": { ext: "rtf", label: "Rich Text Format" },
} as const;

export const ALLOWED_EXTENSIONS = Object.values(SUPPORTED_MIME_TYPES).map(v => v.ext);

export const MAX_FILE_SIZE_MB = 50;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  fileType?: string;
  label?: string;
}

/**
 * Validate an uploaded file
 */
export function validateFile(file: File): FileValidationResult {
  // Check size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)}MB.`,
    };
  }

  // Check MIME type
  const mimeMatch = SUPPORTED_MIME_TYPES[file.type as keyof typeof SUPPORTED_MIME_TYPES];
  if (mimeMatch) {
    return { valid: true, fileType: mimeMatch.ext, label: mimeMatch.label };
  }

  // Fall back to extension check
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext && (ALLOWED_EXTENSIONS as string[]).includes(ext)) {
    const entry = Object.values(SUPPORTED_MIME_TYPES).find(v => v.ext === ext);
    return { valid: true, fileType: ext, label: entry?.label };
  }

  return {
    valid: false,
    error: `Unsupported file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`,
  };
}

/**
 * Generate a comma-separated MIME types string for the <input accept="..."> attribute
 */
export function getAcceptedMimeTypes(): string {
  return Object.keys(SUPPORTED_MIME_TYPES).join(",");
}

/**
 * Check if a file type can be previewed inline
 */
export function canPreview(mimeType: string): boolean {
  return mimeType in SUPPORTED_MIME_TYPES;
}
