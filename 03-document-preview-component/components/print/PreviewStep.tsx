import React from "react";
import { Badge } from "@/components/ui/badge";
import ReusableCard from "@/components/ui/cards";
import { FileText } from "lucide-react";
import { PAPER_SIZE, ORIENTATION, COLOR_TYPE, DUPLEX } from "@/types/printJob";
import DocumentPreview from "./DocumentPreview";

interface PreviewStepProps {
  fileName: string;
  fileBase64: string;
  fileType: string;
  /** The original File object — preferred for client-side rendering */
  file?: File | null;
  currentPage: number;
  pageCount: any;
  zoom: number;

  // Print options — preview adapts to these
  paperSize: PAPER_SIZE;
  orientation: ORIENTATION;
  colorType: COLOR_TYPE;
  duplex?: DUPLEX;
  copies?: number;

  onZoomIn: () => void;
  onZoomOut: () => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
}

export const PreviewStep: React.FC<PreviewStepProps> = ({
  fileName,
  fileBase64,
  fileType,
  file,
  pageCount,
  paperSize,
  orientation,
  colorType,
  duplex,
  copies = 1,
}) => {
  const getFileTypeLabel = () => {
    if (fileType === "application/pdf") return "PDF Document";
    if (fileType.startsWith("image/")) return "Image File";
    if (fileType.includes("word") || fileType.includes("document")) return "Word Document";
    if (fileType.includes("spreadsheet") || fileType.includes("excel")) return "Excel Spreadsheet";
    if (fileType.includes("presentation") || fileType.includes("powerpoint")) return "PowerPoint Presentation";
    if (fileType === "text/plain") return "Text File";
    if (fileType === "text/csv") return "CSV File";
    return "Document";
  };

  const getFileTypeIcon = () => {
    if (fileType === "application/pdf") return "📄";
    if (fileType.startsWith("image/")) return "🖼️";
    if (fileType.includes("word") || fileType.includes("document")) return "📝";
    if (fileType.includes("spreadsheet") || fileType.includes("excel")) return "📊";
    if (fileType.includes("presentation") || fileType.includes("powerpoint")) return "📽️";
    return "📄";
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Left column - File info */}
      <ReusableCard title="Document Details" className="lg:col-span-1">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
            <div className="text-4xl">{getFileTypeIcon()}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <FileText className="h-5 w-5 text-gray-500 flex-shrink-0" />
                <span className="font-medium text-base truncate">{fileName}</span>
              </div>
              <Badge variant="outline" className="mb-3">
                {getFileTypeLabel()}
              </Badge>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Pages:</span>
                  <span>{pageCount || "N/A"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium">Paper Size:</span>
                  <Badge variant="outline">{paperSize}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium">Orientation:</span>
                  <Badge variant="outline" className="capitalize">{orientation}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium">Color:</span>
                  <Badge variant="outline">{colorType === "BLACK_WHITE" ? "B&W" : "Color"}</Badge>
                </div>
                {duplex && (
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Sides:</span>
                    <Badge variant="outline">{duplex === "DOUBLE" ? "Double-sided" : "Single-sided"}</Badge>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="font-medium">Copies:</span>
                  <span>{copies}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="text-xs text-gray-500 p-3 bg-blue-50 rounded-lg">
            <p className="font-medium text-blue-900 mb-1">ℹ️ About this preview</p>
            <p>
              The preview on the right reflects your print options. Switch to black & white to see how it will print without color.
            </p>
          </div>
        </div>
      </ReusableCard>

      {/* Right column - Inline preview */}
      <div className="lg:col-span-2">
        <ReusableCard title="Live Preview">
          <DocumentPreview
            file={file}
            fileBase64={fileBase64}
            fileName={fileName}
            fileType={fileType}
            paperSize={paperSize}
            orientation={orientation}
            colorType={colorType}
            duplex={duplex}
          />
        </ReusableCard>
      </div>
    </div>
  );
};

export default PreviewStep;
