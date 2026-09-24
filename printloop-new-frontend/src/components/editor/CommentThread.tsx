import { useState, useRef, useEffect } from 'react';
import type { CommentThread as CommentThreadType, Comment, EditorRole } from '@/types/editor';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface CommentThreadProps {
  thread: CommentThreadType;
  isActive: boolean;
  role: EditorRole;
  onClick: () => void;
  onAddComment: (content: string) => Promise<void>;
  onResolve: () => Promise<void>;
  onReopen: () => Promise<void>;
  onDelete: () => Promise<void>;
}

export function CommentThread({
  thread,
  isActive,
  role,
  onClick,
  onAddComment,
  onResolve,
  onReopen,
  onDelete,
}: CommentThreadProps) {
  const [isExpanded, setIsExpanded] = useState(isActive);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus textarea when expanded
  useEffect(() => {
    if (isExpanded && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isExpanded]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      await onAddComment(newComment.trim());
      setNewComment('');
    } catch (err) {
      console.error('Failed to add comment:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // Determine if user can delete (shop only)
  const canDelete = role === 'shop';

  return (
    <div
      ref={containerRef}
      className={`absolute pointer-events-auto transition-all duration-200 ${
        isExpanded ? 'z-30' : 'z-10'
      }`}
      style={{
        left: thread.anchor?.startOffset ? `${thread.anchor.startOffset}px` : '0',
        top: thread.pageId ? `${parseInt(thread.pageId) * 800}px` : '0',
      }}
    >
      {/* Thread marker in document */}
      <button
        onClick={() => { onClick(); setIsExpanded(!isExpanded); }}
        className={`relative flex items-center gap-1.5 px-2 py-1 rounded-full border-2 transition-all duration-200 ${
          thread.status === 'resolved' 
            ? 'border-sage bg-sage/10 text-sage' 
            : 'border-persimmon bg-persimmon/10 text-persimmon'
        } ${isActive ? 'scale-110 shadow-[4px_4px_0_#1A1410]' : ''}`}
        aria-label={`Comment thread: ${thread.comments.length} ${thread.comments.length === 1 ? 'comment' : 'comments'}`}
        style={{ pointerEvents: 'auto' }}
      >
        <span className="w-2 h-2 rounded-full bg-current" />
        <span className="text-[10px] font-bold tracking-editorial">
          {thread.comments.length}
        </span>
        {thread.status === 'resolved' && (
          <span className="w-1.5 h-1.5" aria-hidden="true">✓</span>
        )}
      </button>

      {/* Expanded comment panel */}
      {isExpanded && (
        <div className="absolute left-full top-0 ml-2 w-full max-w-[90vw] min-h-[120px] bg-paper border-2 border-ink rounded-pl shadow-[8px_8px_0_#1A1410] pointer-events-auto z-30 animate-fadein">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 p-3 border-b-2 border-ink bg-ink/5">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${thread.status === 'resolved' ? 'bg-sage' : 'bg-persimmon'}`} />
              <span className="text-[10px] font-bold tracking-editorial uppercase">
                {thread.status === 'resolved' ? 'Resolved' : 'Active'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {thread.status === 'resolved' ? (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={onReopen}
                  className="text-sage hover:bg-sage/10"
                  aria-label="Reopen thread"
                >
                  Reopen
                </Button>
              ) : (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={onResolve}
                  className="text-persimmon hover:bg-persimmon/10"
                  aria-label="Resolve thread"
                >
                  Resolve
                </Button>
              )}
              {canDelete && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={onDelete}
                  className="text-persimmon hover:bg-persimmon/10"
                  aria-label="Delete thread"
                >
                  Delete
                </Button>
              )}
            </div>
          </div>

          {/* Comments list */}
          <div className="p-3 space-y-3 max-h-[300px] overflow-y-auto">
            {thread.comments.map((comment, index) => (
              <div 
                key={comment.id} 
                className={`flex gap-2 pb-3 ${index < thread.comments.length - 1 ? 'border-b border-ink/10' : ''}`}
              >
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-ink/10 flex items-center justify-center">
                  <span className="text-[9px] font-bold text-ink/60">
                    {comment.userName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">{comment.userName}</span>
                    <span className="text-[9px] font-bold tracking-editorial text-ink/50 uppercase">
                      {comment.role === 'shop' ? 'Shop' : 'Customer'}
                    </span>
                    <span className="text-[9px] text-ink/40 ml-auto">
                      {formatTime(comment.createdAt)}
                    </span>
                  </div>
                  <div className="text-sm text-ink/80 mt-1 whitespace-pre-wrap break-words">
                    {comment.content}
                  </div>
                  {comment.updatedAt && comment.updatedAt > comment.createdAt && (
                    <div className="text-[9px] text-ink/40 mt-1">
                      Edited · {formatTime(comment.updatedAt)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Add comment form */}
          <form onSubmit={handleSubmit} className="p-3 border-t-2 border-ink bg-ink/5">
            <textarea
              ref={textareaRef}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add a comment..."
              rows={2}
              className="w-full px-3 py-2 border-2 border-ink rounded-md bg-paper text-sm font-medium resize-none focus:outline-none focus:border-persimmon"
              disabled={isSubmitting}
              aria-label="Add comment"
            />
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="ghost" size="sm" type="button" onClick={() => setIsExpanded(false)}>
                Close
              </Button>
              <Button variant="primary" size="sm" type="submit" loading={isSubmitting}>
                {isSubmitting ? 'Posting…' : 'Comment'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function formatTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}