import { useState } from 'react';
import { Reveal } from '@/components/ui/scrollFx';
import { Button } from '@/components/ui/Button';

interface AutoFix {
  type: string;
  description: string;
  confidence: number;
  affectedPages: number[];
  estimatedSizeIncrease: number;
}

interface AutoFixPanelProps {
  fixes: any[];
  selectedFixes: string[];
  onToggle: (fixType: string) => void;
  onApply: () => void;
  isApplying: boolean;
}

const FIX_CONFIG: Record<string, { label: string; icon: string; description: string }> = {
  embed_fonts: { label: 'Embed Fonts', icon: '🔤', description: 'Embed all unembedded fonts by subsetting' },
  rgb_to_cmyk: { label: 'Convert to CMYK', icon: '🎨', description: 'Convert RGB images to CMYK (FOGRA39 profile)' },
  add_bleed: { label: 'Add Bleed', icon: '📐', description: 'Add 3mm bleed by mirroring edge content' },
  upscale_images: { label: 'Upscale Images', icon: '🔍', description: 'AI upscale low-resolution images to 300 DPI (ESRGAN)' },
  add_trim_marks: { label: 'Add Trim Marks', icon: '✂️', description: 'Add trim/crop marks at 3mm offset' },
  fix_overset_text: { label: 'Fix Overset Text', icon: '📝', description: 'Auto-size text frames to fit content' },
  flatten_transparency: { label: 'Flatten Transparency', icon: '🔄', description: 'Flatten transparency using high-res rasterization' },
  fix_overprint: { label: 'Fix Overprint', icon: '👁️', description: 'Remove unintended overprint settings' },
};

export function AutoFixPanel({ fixes, selectedFixes, onToggle, onApply, isApplying }: AutoFixPanelProps) {
  if (fixes.length === 0) {
    return (
      <Reveal variant="fade">
        <div className="border-2 border-emerald-600 bg-emerald-50 rounded-pl p-6 text-center">
          <div className="text-3xl mb-2">✓</div>
          <h3 className="pl-serif font-bold text-lg text-emerald-600 mb-2">No Fixes Needed</h3>
          <p className="text-gray-900/60">Your file is print-ready! No auto-fixes available.</p>
        </div>
      </Reveal>
    );
  }

  const totalSizeIncrease = fixes.reduce((sum, f) => sum + (f.estimatedSizeIncrease || 0), 0);
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const [showAll, setShowAll] = useState(false);

  return (
    <div className="space-y-4">
      {/* Header */}
      <Reveal variant="wipe">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="pl-serif font-bold text-xl">Auto-Fixes Available</h3>
            <p className="text-sm text-gray-900/60">
              {fixes.length} fix{fixes.length !== 1 ? 'es' : ''} available • 
              {selectedFixes.length} selected • ~{formatBytes(totalSizeIncrease)} size increase
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="pl-btn-sm"
              onClick={() => {
                fixes.forEach(f => f.type && !selectedFixes.includes(f.type) && onToggle(f.type));
              }}
              disabled={selectedFixes.length === fixes.length}
            >
              Select All
            </Button>
            <Button
              variant="ghost"
              className="pl-btn-sm"
              onClick={() => {
                selectedFixes.forEach(f => onToggle(f));
              }}
              disabled={selectedFixes.length === 0}
            >
              Clear All
            </Button>
          </div>
        </div>
      </Reveal>

      {/* Fix Cards */}
      <Reveal variant="rise" delay={100}>
        <div className="space-y-3">
          {fixes.map((fix, idx) => {
            const config = FIX_CONFIG[fix.type] || { label: fix.type, icon: '🔧', description: fix.description };
            const isSelected = selectedFixes.includes(fix.type);
            const affectedCount = fix.affectedPages?.length || 0;

            return (
              <Reveal key={fix.type} variant="rise" delay={idx * 50}>
                <div className={`flex items-center gap-4 p-4 rounded-pl border-2 ${isSelected ? 'border-indigo-600 bg-indigo-50' : 'border-gray-900/20 bg-gray-100'} group transition-colors`}>
                  <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-pl bg-gray-900/10 text-2xl">
                    {FIX_CONFIG[fix.type]?.icon || '🔧'}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-base">{FIX_CONFIG[fix.type]?.label || fix.type}</span>
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-pl-sm bg-gray-900/10 text-gray-900">
                        {fix.affectedPages?.length || 0} page{affectedCount !== 1 ? 's' : ''}
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-pl-sm bg-emerald-50 text-emerald-600">
                        {Math.round((fix.confidence || 0) * 100)}% confidence
                      </span>
                    </div>
                    <p className="text-sm text-gray-900/60 mb-2">{FIX_CONFIG[fix.type]?.description || fix.description}</p>
                    
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-900/50">~</span>
                        <span className="pl-mono text-xs font-bold text-gray-900/60">+{fix.estimatedSizeIncrease ? formatBytes(fix.estimatedSizeIncrease) : '0 B'}</span>
                        <span className="text-xs text-gray-900/40">file size</span>
                      </div>
                      
                      <div className="ml-auto">
                        <Button
                          variant={isSelected ? 'primary' : 'ghost'}
                          className="pl-btn-sm"
                          onClick={() => onToggle(fix.type)}
                        >
                          {isSelected ? 'Selected' : 'Add to Fixes'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </Reveal>

          {/* Apply Button */}
          <Reveal variant="fade" delay={200}>
            <div className="border-t-2 border-gray-900 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold">Apply {selectedFixes.length > 1 ? 'selected fixes' : 'selected fix'}</p>
                  <p className="text-sm text-gray-900/60">
                    Creates a new PDF with selected fixes applied. Original file unchanged.
                  </p>
                </div>
                <Button
                  variant="primary"
                  className="pl-btn-lg w-full sm:w-auto"
                  arrow
                  onClick={onApply}
                  disabled={isApplying || selectedFixes.length === 0}
                >
                  {isApplying ? 'Applying Fixes…' : 'Apply Fixes & Download'}
                </Button>
              </div>
            </div>
</Reveal>
        </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}