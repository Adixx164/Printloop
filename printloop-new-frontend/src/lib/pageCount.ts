/**
 * PDF page count utility.
 * 
 * The pdfjs-dist dependency has been removed per the V2 redesign.
 * This utility exports a no-op function that returns a default page count
 * of 1 for any input, since PDF parsing is not available in the
 * current build configuration.
 */
export const getPageCount = async (): Promise<number> => {
  return 1;
};

export const ensurePdfJs = async (): Promise<void> => {
  // No-op: pdfjs-dist has been removed
};

/**
 * Check if a filename is an Office document (Word, Excel, PowerPoint).
 * Used to determine if server-side conversion is needed.
 */
export const isOfficeName = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext || '');
};

/**
 * MIME types accepted by the file upload input.
 */
export const uploadAcceptBase = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
];

/**
 * Returns the accept string for the file input, optionally including Office types.
 */
export const uploadAccept = (includeOffice: boolean): string => {
  if (includeOffice) return uploadAcceptBase.join(',');
  // Without Office, only PDF and images
  return ['application/pdf', 'image/jpeg', 'image/png'].join(',');
};

/**
 * Detect number of pages in a file.
 * Returns a result object with page count and metadata.
 */
export const detectPages = async (file: File): Promise<{
  supported: boolean;
  source: 'pdf' | 'office' | 'image';
  pageCount: number;
  rangeable: boolean;
}> => {
  const ext = file.name.split('.').pop()?.toLowerCase();
  const isOffice = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext || '');
  
  if (file.type === 'application/pdf') {
    return { supported: true, source: 'pdf', pageCount: 1, rangeable: true };
  }
  
  if (isOffice) {
    return { supported: true, source: 'office', pageCount: 1, rangeable: false };
  }
  
  if (file.type.startsWith('image/')) {
    return { supported: true, source: 'image', pageCount: 1, rangeable: false };
  }
  
  return { supported: false, source: 'pdf', pageCount: 0, rangeable: false };
};