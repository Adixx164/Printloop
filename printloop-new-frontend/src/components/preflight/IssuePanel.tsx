import { useState } from 'react';
import { Reveal } from '@/components/ui/scrollFx';

interface Issue {
  type: string;
  severity: 'error' | 'warning' | 'info';
  page: number;
  details: string;
  autoFixable: boolean;
  location?: { x: number; y: number; w: number; h: number };
}

interface IssuePanelProps {
  issues: any[];
  onFixSelect: (fixType: string) => void;
  selectedFixes: string[];
  onFixToggle: (fixType: string) => void;
}

const SEVERITY_CONFIG = {
  error: { label: 'ERROR', color: 'persimmon', bg: 'bg-persimmon/10', icon: '✕' },
  warning: { label: 'WARNING', color: 'ochre', bg: 'bg-ochre/10', icon: '⚠' },
  info: { label: 'INFO', color: 'sage', bg: 'bg-sage/10', icon: 'ℹ' },
};

const TYPE_LABELS: Record<string, string> = {
  missing_font: 'Missing Font',
  low_res: 'Low Resolution',
  wrong_colorspace: 'Wrong Colorspace',
  missing_bleed: 'Missing Bleed',
  trim_issues: 'Trim/Safe Margin',
  overset_text: 'Overset Text',
  transparency: 'Transparency',
  overprint: 'Overprint',
};

interface IssueItemProps {
  issue: any;
  onFixSelect: (fixType: string) => void;
  selectedFixes: string[];
  onFixToggle: (fixType: string) => void;
}

function IssueItem({ issue, onFixSelect, selectedFixes, onFixToggle }: IssueItemProps) {
  const config = SEVERITY_CONFIG[issue.severity];
  const isSelected = selectedFixes.includes(issue.type);
  const typeLabel = TYPE_LABELS[issue.type] || issue.type;

  return (
    <div className={`flex items-start gap-3 p-3 rounded-pl border-2 ${issue.severity === 'error' ? 'border-persimmon/30 bg-persimmon/5' : issue.severity === 'warning' ? 'border-ochre/30 bg-ochre/5' : 'border-sage/30 bg-sage/10'}`}>
      <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold" style={{ backgroundColor: `var(--color-${config.bg})`, color: `var(--color-${config.color})` }}>
        {config.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-bold text-sm">{TYPE_LABELS[issue.type] || issue.type}</span>
          <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-pl-sm ${issue.severity === 'error' ? 'bg-persimmon text-paper' : issue.severity === 'warning' ? 'bg-ochre text-paper' : 'bg-sage text-paper'}`}>
            {issue.severity.toUpperCase()}
          </span>
          <span className="pl-mono text-xs text-ink/40">Page {issue.page}</span>
        </div>
        <p className="text-sm text-ink/70 mb-2">{issue.details}</p>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={true}
              disabled
              className="w-4 h-4 accent-persimmon rounded border-ink/30"
            />
            <span className="text-xs text-ink/60">Apply auto-fix</span>
          </label>
          {issue.autoFixable && (
            <button
              onClick={() => onFixToggle(issue.type)}
              className={`px-2 py-1 text-xs font-bold rounded-pl-sm transition-colors ${isSelected ? 'bg-persimmon text-paper' : 'bg-paper border-2 border-ink text-ink hover:bg-ink hover:text-paper'}`}
            >
              {isSelected ? 'Selected' : 'Add to fixes'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
export function IssuePanel({ issues, onFixSelect, selectedFixes, onFixToggle }: IssuePanelProps) {
  const [expandedPages, setExpandedPages] = useState<Set<number>>(new Set());
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'error' | 'warning' | 'info'>('all');

  const filteredIssues = issues.filter(issue => 
    filterSeverity === 'all' || issue.severity === filterSeverity
  );

  const groupedByPage = filteredIssues.reduce((acc, issue) => {
    if (!acc[issue.page]) acc[issue.page] = [];
    acc[issue.page].push(issue);
    return acc;
  }, {} as Record<number, typeof issues>);

  const pages = Object.keys(groupedByPage).map(Number).sort((a, b) => a - b);
  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;

  if (issues.length === 0) {
    return (
      <Reveal variant="fade">
        <div className="border-2 border-sage bg-sage/10 rounded-pl p-8 text-center">
          <div className="text-3xl mb-2">✓</div>
          <h3 className="pl-serif font-bold text-xl text-sage mb-2">Print Ready!</h3>
          <p className="text-ink/60">No issues detected. Your file is ready to print.</p>
        </div>
      </Reveal>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Bar */}
      <Reveal variant="wipe">
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setFilterSeverity('all')}
            className={`px-3 py-1.5 text-sm font-bold rounded-pl-sm transition-colors ${
              filterSeverity === 'all' ? 'bg-ink text-paper' : 'bg-paper-light border-2 border-ink'
            }`}
          >
            All ({issues.length})
          </button>
          <button
            onClick={() => setFilterSeverity('error')}
            className={`px-3 py-1.5 text-sm font-bold rounded-pl-sm transition-colors ${
              filterSeverity === 'error' ? 'bg-persimmon text-paper' : 'bg-paper-light border-2 border-persimmon text-persimmon'
            }`}
          >
            Errors ({errorCount})
          </button>
          <button
            onClick={() => setFilterSeverity('warning')}
            className={`px-3 py-1.5 text-sm font-bold rounded-pl-sm transition-colors ${
              filterSeverity === 'warning' ? 'bg-ochre text-paper' : 'bg-paper-light border-2 border-ochre text-ochre'
            }`}
          >
            Warnings ({warningCount})
          </button>
          <button
            onClick={() => setFilterSeverity('info')}
            className={`px-3 py-1.5 text-sm font-bold rounded-pl-sm transition-colors ${
              filterSeverity === 'info' ? 'bg-sage text-paper' : 'bg-paper-light border-2 border-sage text-sage'
            }`}
          >
            Info ({infoCount})
          </button>
        </div>
      </Reveal>

      {/* Issues by Page */}
      <Reveal variant="rise" delay={100}>
        <div className="space-y-4">
          {pages.map((pageNum) => {
            const pageIssues = groupedByPage[pageNum];
            const isExpanded = expandedPages.has(pageNum);
            
            return (
              <div key={pageNum} className="border-2 border-ink rounded-pl overflow-hidden bg-paper-light">
                <button
                  onClick={() => setExpandedPages(prev => {
                    const next = new Set(expandedPages);
                    if (next.has(pageNum)) next.delete(pageNum);
                    else next.add(pageNum);
                    return next;
                  })}
                  className="w-full px-4 py-3 flex items-center justify-between bg-paper-light/50 hover:bg-paper-light transition-colors"
                >
                  <div className="flex items-center gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedPages(prev => {
                            const next = new Set(expandedPages);
                            if (next.has(pageNum)) next.delete(pageNum);
                            else next.add(pageNum);
                            return next;
                          });
                        }}
                        className="p-1 text-ink/50 hover:text-ink transition-colors"
                        aria-label={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        <svg className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="pl-mono font-bold text-sm">Page {pageNum}</span>
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-pl-sm bg-ink/10 text-ink">
                            {pageIssues.length} issue{pageIssues.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {pageIssues.some(i => i.severity === 'error') && (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-pl-sm bg-persimmon/10 text-persimmon">
                            {pageIssues.filter(i => i.severity === 'error').length} errors
                          </span>
                        )}
                        {pageIssues.some(i => i.severity === 'warning') && (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-pl-sm bg-ochre/10 text-ochre">
                            {pageIssues.filter(i => i.severity === 'warning').length} warnings
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                
                <div className={`overflow-hidden transition-all duration-200 ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="px-4 pb-4 space-y-2 border-t border-ink/10">
                    {pageIssues.map((issue, idx) => (
                      <IssueItem
                        key={`${pageNum}-${idx}`}
                        issue={issue}
                        onFixSelect={onFixSelect}
                        selectedFixes={selectedFixes}
                        onFixToggle={onFixToggle}
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </Reveal>

      {/* Quick Actions */}
      <Reveal variant="rise" delay={200}>
        <div className="border-2 border-ink rounded-pl p-4 bg-paper-light">
          <div className="editorial-label text-persimmon mb-2">QUICK ACTIONS</div>
          <div className="flex flex-wrap gap-2">
            <button
              className="px-3 py-1.5 text-sm font-bold rounded-pl-sm bg-persimmon text-paper hover:bg-persimmon/90"
              onClick={() => {
                issues.filter(i => i.autoFixable).forEach(i => onFixSelect(i.type));
              }}
            >
              Select All Auto-Fixable
            </button>
            <button
              className="px-3 py-1.5 text-sm font-bold rounded-pl-sm bg-ink text-paper hover:bg-ink/90"
              onClick={() => issues.forEach(i => onFixSelect(i.type))}
            >
              Select All
            </button>
            <button
              className="px-3 py-1.5 text-sm font-bold rounded-pl-sm bg-paper border-2 border-ink text-ink hover:bg-ink hover:text-paper"
              onClick={() => issues.forEach(i => onFixSelect(i.type))}
            >
              Clear All
            </button>
          </div>
        </div>
      </Reveal>
    </div>
  );
}