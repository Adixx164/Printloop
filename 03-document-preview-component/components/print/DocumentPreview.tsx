import React, { useMemo } from "react";
import DocViewer, { DocViewerRenderers } from "@iamjariwala/react-doc-viewer";
import "@iamjariwala/react-doc-viewer/dist/index.css";
import { PAPER_SIZE, ORIENTATION, COLOR_TYPE, DUPLEX } from "@/types/printJob";

/**
 * Map a MIME type or filename to the file type string the viewer expects
 */
function detectFileType(file: File | null, fileName: string, mimeType: string): string | undefined {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("image/")) return mimeType.split("/")[1]; // jpg, png, etc.
  if (mimeType.includes("wordprocessingml")) return "docx";
  if (mimeType === "application/msword") return "doc";
  if (mimeType.includes("spreadsheetml")) return "xlsx";
  if (mimeType === "application/vnd.ms-excel") return "xls";
  if (mimeType.includes("presentationml")) return "pptx";
  if (mimeType === "application/vnd.ms-powerpoint") return "ppt";
  if (mimeType === "text/plain") return "txt";
  if (mimeType === "text/csv") return "csv";
  if (mimeType === "text/html") return "html";
  if (mimeType === "text/markdown") return "md";

  // Fall back to extension
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ext;
}

/**
 * Convert paper size to CSS aspect ratio for preview frame
 */
function getPaperAspectRatio(paperSize: PAPER_SIZE): string {
  switch (paperSize) {
    case "A4": return "210 / 297";    // 1 : 1.414
    case "A3": return "297 / 420";    // 1 : 1.414 (same ratio, larger)
    case "LETTER": return "8.5 / 11"; // ~1 : 1.294
    case "LEGAL": return "8.5 / 14";  // ~1 : 1.647
    default: return "210 / 297";
  }
}

interface DocumentPreviewProps {
  /** The original File object (preferred for client-side rendering) */
  file?: File | null;
  /** Or a base64 data URL if the file has been encoded already */
  fileBase64?: string;
  /** Or a remote URL (e.g., Cloudinary) — used after upload completes */
  fileUrl?: string;
  fileName: string;
  fileType: string;

  /** Print options — preview adapts to these */
  paperSize: PAPER_SIZE;
  orientation: ORIENTATION;
  colorType: COLOR_TYPE;
  duplex?: DUPLEX;

  /** Whether to wrap the preview in a paper-shaped frame (default: true) */
  showPaperFrame?: boolean;

  /** Watermark text (used in group printing flow) */
  watermarkText?: string;

  /** Theme passed to the viewer */
  theme?: "light" | "dark" | "auto";
}

/**
 * Renders an inline document preview using @iamjariwala/react-doc-viewer.
 * Reflects the user's print options:
 *   - colorType=BLACK_WHITE → CSS grayscale filter
 *   - orientation=landscape → rotates the preview frame
 *   - paperSize → adjusts the preview frame's aspect ratio
 *   - watermarkText → overlays the doc viewer's built-in watermark
 *
 * Supports 20+ file types: PDF, DOCX, XLSX, PPTX, images, CSV, TXT, MD, HTML, video.
 */
export const DocumentPreview: React.FC<DocumentPreviewProps> = ({
  file,
  fileBase64,
  fileUrl,
  fileName,
  fileType,
  paperSize,
  orientation,
  colorType,
  watermarkText,
  showPaperFrame = true,
  theme = "auto",
}) => {
  // Build the document URI for the viewer — prefer File > base64 > URL
  const documents = useMemo(() => {
    if (file) {
      const objectUrl = URL.createObjectURL(file);
      const detected = detectFileType(file, fileName, fileType);
      return [{ uri: objectUrl, fileName, fileType: detected }];
    }
    if (fileBase64) {
      const detected = detectFileType(null, fileName, fileType);
      return [{ uri: fileBase64, fileName, fileType: detected }];
    }
    if (fileUrl) {
      const detected = detectFileType(null, fileName, fileType);
      return [{ uri: fileUrl, fileName, fileType: detected }];
    }
    return [];
  }, [file, fileBase64, fileUrl, fileName, fileType]);

  // Cleanup object URLs on unmount
  React.useEffect(() => {
    return () => {
      documents.forEach((d) => {
        if (d.uri.startsWith("blob:")) URL.revokeObjectURL(d.uri);
      });
    };
  }, [documents]);

  // Print-option-aware styling
  const grayscale = colorType === "BLACK_WHITE";
  const isLandscape = orientation === "landscape";
  const aspectRatio = getPaperAspectRatio(paperSize);

  const containerStyle: React.CSSProperties = showPaperFrame
    ? {
        aspectRatio: isLandscape
          ? aspectRatio.split(" / ").reverse().join(" / ")
          : aspectRatio,
        maxWidth: isLandscape ? "100%" : "min(100%, 600px)",
        margin: "0 auto",
        boxShadow: "0 4px 24px rgba(0, 0, 0, 0.08)",
        borderRadius: "8px",
        overflow: "hidden",
        background: "white",
      }
    : { width: "100%", height: "70vh" };

  const filterStyle: React.CSSProperties = grayscale
    ? { filter: "grayscale(100%)" }
    : {};

  if (documents.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg text-gray-500">
        No document to preview
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Print options badge bar above preview */}
      <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
        <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded font-medium">
          {paperSize} · {orientation}
        </span>
        <span
          className={`px-2 py-1 rounded font-medium ${
            grayscale
              ? "bg-gray-100 text-gray-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {grayscale ? "Black & White" : "Color"}
        </span>
        {watermarkText && (
          <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded font-medium">
            ID: {watermarkText}
          </span>
        )}
      </div>

      {/* Paper-shaped preview frame */}
      <div style={containerStyle}>
        <div style={{ ...filterStyle, height: "100%", width: "100%" }}>
          <DocViewer
            documents={documents}
            pluginRenderers={DocViewerRenderers}
            theme={theme}
            config={{
              header: {
                disableHeader: false,
                disableFileName: false,
                retainURLParams: false,
              },
              csvDelimiter: ",",
              pdfZoom: {
                defaultZoom: 1,
                zoomJump: 0.2,
              },
              pdfVerticalScrollByDefault: true,
              // Watermark overlay (used for group prints)
              ...(watermarkText && {
                watermark: {
                  text: watermarkText,
                  textColor: "rgba(120, 120, 120, 0.5)",
                  fontSize: 14,
                  rotate: 0,
                  position: "bottom-right",
                },
              }),
            }}
            style={{ height: "100%", width: "100%" }}
          />
        </div>
      </div>

      {/* Helper note below preview */}
      <p className="text-xs text-gray-500 mt-2 text-center">
        Preview shows how your document will appear when printed.
        {grayscale && " Colors will be converted to grayscale."}
      </p>
    </div>
  );
};

export default DocumentPreview;
