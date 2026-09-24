import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAnalyzePreflightMutation, useGetCapabilitiesQuery } from '@/store/services/preflightApi';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Reveal } from '@/components/ui/scrollFx';

interface PrintConfig {
  copies: number;
  paper: 'A4' | 'A3' | 'Letter' | 'Legal';
  color: 'bw' | 'color';
  sided: 'single' | 'double';
  qualityDpi: 100 | 300 | 600;
  bleed?: number;
  orientation?: 'portrait' | 'landscape';
}

interface PreflightUploaderProps {
  onAnalysisComplete?: (result: any) => void;
  initialConfig?: Partial<PrintConfig>;
}

export function PreflightUploader({ onAnalysisComplete, initialConfig }: PreflightUploaderProps) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [config, setConfig] = useState<PrintConfig>({
    copies: 1,
    paper: 'A4',
    color: 'bw',
    sided: 'single',
    qualityDpi: 300,
    bleed: 3,
    orientation: 'portrait',
    ...initialConfig,
  });
  const [analyze, { isLoading, isError, data, error }] = useAnalyzePreflightMutation();
  const { data: capabilities } = useGetCapabilitiesQuery();
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = async (file: File) => {
    // Check if file is PDF, image, or office document
    const isPdf = file.type === 'application/pdf';
    const isImage = file.type.startsWith('image/');
    const isOffice = [
      'application/vnd.oasis.opendocument.text',
      'application/vnd.oasis.opendocument.presentation',
      'application/vnd.oasis.opendocument.spreadsheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'application/vnd.ms-powerpoint',
      'application/vnd.ms-excel',
      'application/rtf',
      'text/plain',
      'text/csv'
    ].includes(file.type);

    if (!file.type.includes('pdf') && !file.type.startsWith('image/') && !isOffice) {
      alert('Unsupported file type. Please upload a PDF, image, or office document (ODT/ODP/ODS, DOCX/PPTX/XLSX, RTF, TXT, CSV).');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      alert('File size must be less than 50MB');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('printConfiguration', JSON.stringify(config));

      const result = await analyze(formData).unwrap();
      if (onAnalysisComplete) {
        onAnalysisComplete(result.data);
      }
      // Navigate to results page or show modal
      // For now, we'll show results inline
    } catch (err) {
      console.error('Analysis failed:', err);
    }
  };

  const handleConfigChange = (key: keyof PrintConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      {/* Config Panel */}
      <Reveal variant="rise">
        <section className="border-2 border-ink rounded-pl p-4 sm:p-6 bg-paper-light">
          <h3 className="pl-serif font-bold text-xl mb-4">Print Settings</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Input
              label="COPIES"
              type="number"
              value={config.copies}
              onChange={(e) => handleConfigChange('copies', parseInt(e.target.value) || 1)}
              min={1}
              max={999}
            />
            <Select
              label="PAPER SIZE"
              value={config.paper}
              onChange={(e) => handleConfigChange('paper', e.target.value as any)}
              options={[
                { value: 'A4', label: 'A4 (210×297mm)' },
                { value: 'A3', label: 'A3 (297×420mm)' },
                { value: 'Letter', label: 'Letter (8.5×11in)' },
                { value: 'Legal', label: 'Legal (8.5×14in)' },
              ]}
            />
            <Select
              label="COLOR MODE"
              value={config.color}
              onChange={(e) => handleConfigChange('color', e.target.value as any)}
              options={[
                { value: 'bw', label: 'Black & White' },
                { value: 'color', label: 'Full Color' },
              ]}
            />
            <Select
              label="SIDES"
              value={config.sided}
              onChange={(e) => handleConfigChange('sided', e.target.value as any)}
              options={[
                { value: 'single', label: 'Single-sided' },
                { value: 'double', label: 'Double-sided' },
              ]}
            />
            <Select
              label="QUALITY (DPI)"
              value={config.qualityDpi}
              onChange={(e) => handleConfigChange('qualityDpi', parseInt(e.target.value))}
              options={[
                { value: 100, label: '100 DPI (Draft)' },
                { value: 300, label: '300 DPI (Standard)' },
                { value: 600, label: '600 DPI (High Quality)' },
              ]}
            />
            <Input
              label="BLEED (mm)"
              type="number"
              value={config.bleed}
              onChange={(e) => handleConfigChange('bleed', parseInt(e.target.value) || 3)}
              min={0}
              max={10}
            />
            <Select
              label="ORIENTATION"
              value={config.orientation}
              onChange={(e) => handleConfigChange('orientation', e.target.value as any)}
              options={[
                { value: 'portrait', label: 'Portrait' },
                { value: 'landscape', label: 'Landscape' },
              ]}
            />
          </div>
        </section>
      </Reveal>

      {/* Upload Zone */}
      <Reveal variant="rise" delay={100}>
        <div
          ref={fileInputRef}
          className={`relative border-2 border-dashed rounded-pl p-8 sm:p-12 text-center transition-colors ${
            dragActive ? 'border-persimmon bg-persimmon/5' : 'border-ink/20 hover:border-persimmon'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,image/*,.odt,.odp,.ods,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.odt,.odp,.ods,.rtf,.txt,.csv"
            onChange={handleFileSelect}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-label="Upload document"
          />
          <div className="relative z-10">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-persimmon/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-persimmon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <h3 className="pl-serif font-bold text-xl mb-2">Drop your document here</h3>
            <p className="text-ink/60 mb-4">or click to browse</p>
            <p className="text-sm text-ink/40">Max 50MB • PDF, images, ODT/ODP/ODS, DOCX/PPTX/XLSX, RTF, TXT, CSV</p>
            <Button
              variant="ghost"
              className="mt-4"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
            >
              Browse Files
            </Button>
          </div>
        </div>
      </Reveal>

{/* Loading State */}
      {isLoading && (
        <Reveal variant="fade">
          <div className="border-2 border-ink rounded-pl p-8 bg-paper-light text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-8 h-8 border-4 border-persimmon border-t-transparent rounded-full animate-spin" />
              <span className="pl-serif text-xl font-bold">Analyzing your document...</span>
            </div>
            <p className="text-ink/60">Checking fonts, images, bleed, colorspace & more</p>
          </div>
        </Reveal>
      )}

      {/* Error State */}
      {isError && (
        <div className="border-2 border-persimmon bg-persimmon/5 rounded-pl p-4">
          <p className="text-persimmon font-semibold">Analysis failed: {extractError(error)}</p>
          <Button variant="ghost" className="mt-2" onClick={() => fileInputRef.current?.click()}>
            Try Again
          </Button>
        </div>
      )}

      {/* Capabilities Reference */}
      {capabilities && (
        <Reveal variant="fade" delay={200}>
          <details className="border-2 border-ink rounded-pl bg-paper-light">
            <summary className="p-4 font-bold cursor-pointer flex items-center justify-between">
              <span>Supported Auto-Fixes</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div className="px-4 pb-4 space-y-2">
              {capabilities.data.map((cap: any) => (
                <div key={cap.type} className="flex items-center gap-3 p-3 bg-paper rounded-pl border border-ink/10">
                  <span className="w-8 h-8 rounded-full bg-ink/10 flex items-center justify-center">
                    <span className="text-[10px] font-bold">{cap.icon?.charAt(0) || '🔧'}</span>
                  </span>
                  <div>
                    <div className="font-bold text-sm">{cap.label}</div>
                    <div className="text-xs text-ink/60">{cap.description}</div>
                  </div>
                  <span className={`ml-auto px-2 py-0.5 text-[10px] font-bold rounded-pl-sm ${cap.autoApplicable ? 'bg-sage/20 text-sage' : 'bg-ochre/20 text-ochre'}`}>
                    {cap.autoApplicable ? 'Auto' : 'Manual'}
                  </span>
                </div>
              ))}
            </div>
          </details>
        </Reveal>
      )}
    </div>
  );
}

function extractError(err: any): string {
  return err?.data?.message || err?.message || 'Unknown error';
}