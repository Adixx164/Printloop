import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import type { DocumentVersion } from '@/types/editor';

interface VersionHistoryProps {
  versions: DocumentVersion[];
  currentVersion: number;
  onRestore: (version: number) => void;
  onLabel: (version: number, label: string) => void;
}

export function VersionHistory({ 
  versions, 
  currentVersion, 
  onRestore, 
  onLabel 
}: VersionHistoryProps) {
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null);
  const [labelInput, setLabelInput] = useState<Record<number, string>>({});

  const sortedVersions = useMemo(() => 
    [...versions].sort((a, b) => b.version - a.version), 
  [versions]);

  const handleRestore = (version: number) => {
    if (confirm(`Restore to version ${version}? This will replace current content.`)) {
      onRestore(version);
    }
  };

  const handleLabelSave = (version: number) => {
    const label = labelInput[version];
    if (label?.trim()) {
      onLabel(version, label.trim());
      setLabelInput(prev => ({ ...prev, [version]: '' }));
    }
  };

  const handleLabelInputChange = (version: number, value: string) => {
    setLabelInput(prev => ({ ...prev, [version]: value }));
  };

  return (
    <div className="border-2 border-ink bg-paper-light rounded-pl p-4 h-full overflow-y-auto">
      <div className="sticky top-0 z-10 mb-3 border-b-2 border-ink bg-paper-light px-2 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-ochre" />
          <span className="editorial-label text-ochre">VERSION HISTORY</span>
        </div>
        <span className="text-[10px] font-bold tracking-editorial text-ink/50">
          {versions.length} version{versions.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-2 max-h-[calc(100vh-120px)] overflow-y-auto">
        {sortedVersions.map((version) => {
          const isCurrent = version.version === currentVersion;
          const isExpanded = expandedVersion === version.version;

          return (
            <div 
              key={version.id}
              className={`border-2 rounded-pl p-3 transition-all duration-200 ${
                isCurrent ? 'border-ochre bg-ochre/5' : 'border-ink/10 bg-paper'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className={`w-2 h-2 rounded-full ${isCurrent ? 'bg-ochre' : 'bg-persimmon'}`} />
                  <span className="font-bold text-sm flex-1 truncate">
                    Version {version.version}
                    {version.label && <span className="ml-2 text-sm text-ink/50">«{version.label}»</span>}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-bold text-ink/50">
                    {version.createdAt ? new Date(version.createdAt).toLocaleString() : '—'}
                  </span>
                  <span className="text-[10px] font-bold text-ink/50">
                    ({version.size || 0} KB)
                  </span>
                </div>
              </div>

              <div className={`mt-2 transition-all duration-200 overflow-hidden ${isExpanded ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="pt-2 space-y-2">
                  <div className="flex gap-2 flex-wrap">
                    {!isCurrent && (
                      <Button 
                        variant="primary" 
                        size="sm" 
                        onClick={() => handleRestore(version.version)}
                        className="flex-1 sm:flex-none"
                      >
                        Restore This Version
                      </Button>
                    )}
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setExpandedVersion(isExpanded ? null : version.version)}
                      className="flex-1 sm:flex-none"
                    >
                      {isExpanded ? 'Collapse' : 'Details'}
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setExpandedVersion(version.version)}
                      className="flex-1 sm:flex-none"
                    >
                      Add Label
                    </Button>
                  </div>

                  {/* Label input */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={labelInput[version.version] || ''}
                      onChange={(e) => handleLabelInputChange(version.version, e.target.value)}
                      placeholder="Enter label (e.g., 'Before customer review', 'v1.0')"
                      className="flex-1 border-2 border-ink rounded-md px-2 py-1 text-sm bg-paper focus:outline-none focus:border-persimmon"
                    />
                    <Button 
                      variant="primary" 
                      size="sm" 
                      onClick={() => handleLabelSave(version.version)}
                      disabled={!labelInput[version.version]?.trim()}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function formatTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}