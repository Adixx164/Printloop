import { useMemo } from 'react';
import type { AwarenessState, EditorRole } from '@/types/editor';

interface CollaborationCursorsProps {
  awarenessStates: AwarenessState[];
  currentUserId: string;
  role: EditorRole;
}

const ROLE_COLORS: Record<EditorRole, string> = {
  shop: '#D14B2C', // persimmon
  customer: '#6B7A5C', // sage
};

const ROLE_LABELS: Record<EditorRole, string> = {
  shop: 'Shop',
  customer: 'Customer',
};

export function CollaborationCursors({
  awarenessStates,
  currentUserId,
  role,
}: CollaborationCursorsProps) {
  // Filter out current user and get other participants
  const otherUsers = useMemo(() => 
    awarenessStates.filter(state => state.userId !== currentUserId),
    [awarenessStates, currentUserId]
  );

  if (otherUsers.length === 0) {
    return null;
  }

  return (
    <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden" aria-hidden="true">
      {otherUsers.map(user => (
        <UserCursor
          key={user.userId}
          user={user}
          currentUserId={currentUserId}
        />
      ))}
    </div>
  );
}

interface UserCursorProps {
  user: AwarenessState;
  currentUserId: string;
}

function UserCursor({ user }: UserCursorProps) {
  const color = ROLE_COLORS[user.role] || '#888888';
  const label = `${ROLE_LABELS[user.role]}: ${user.userName}`;
  
  // Cursor position (in viewport coordinates)
  const cursorStyle = user.cursor ? {
    position: 'absolute' as const,
    left: `${user.cursor.x}px`,
    top: `${user.cursor.y}px`,
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none' as const,
    zIndex: 100,
  } : { display: 'none' as const };

  // Selection highlight
  const selectionStyle = user.selection ? {
    position: 'absolute' as const,
    left: `${user.selection.start}px`, // This would need to be converted to viewport coords
    width: `${user.selection.end - user.selection.start}px`,
    height: '1.2em',
    backgroundColor: `${color}40`, // 25% opacity
    pointerEvents: 'none',
    zIndex: 10,
  } : { display: 'none' as const };

  return (
    <div className="pointer-events-none">
      {/* Cursor */}
      <div style={cursorStyle}>
        <div 
          style={{
            width: '2px',
            height: '20px',
            backgroundColor: color,
            position: 'relative',
          }}
        >
          <div 
            style={{
              position: 'absolute',
              top: '-8px',
              left: '-6px',
              width: '12px',
              height: '12px',
              backgroundColor: color,
              border: '2px solid #F8F4ED',
              borderRadius: '50% 50% 50% 0',
              transform: 'rotate(-45deg)',
            }}
          />
        </div>
        <div 
          style={{
            position: 'absolute',
            top: '22px',
            left: '-4px',
            backgroundColor: color,
            color: '#F8F4ED',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          {user.userName} ({ROLE_LABELS[user.role]})
        </div>
      </div>

      {/* Presence indicator in toolbar area */}
      <PresenceBadge user={user} color={color} />
    </div>
  );
}

function PresenceBadge({ user, color }: { user: AwarenessState; color: string }) {
  return (
    <div 
      className="fixed top-4 right-4 z-30 pointer-events-none"
      style={{ display: user.presence === 'idle' ? 'none' : 'flex' }}
    >
      <div 
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          backgroundColor: '#1A1410',
          color: '#F8F4ED',
          padding: '6px 10px',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: '600',
          fontFamily: 'Inter, system-ui, sans-serif',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          border: `2px solid ${color}`,
        }}
      >
        <div 
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: color,
            animation: user.presence === 'editing' ? 'pulse 1.5s infinite' : 'none',
          }}
        />
        <span>{user.userName}</span>
        <span style={{ color: '#888888', fontWeight: 'normal' }}>
          {user.presence === 'editing' ? 'editing' : 'viewing'}
        </span>
        <span style={{ color, fontWeight: 'bold' }}>
          {ROLE_LABELS[user.role]}
        </span>
      </div>
    </div>
  );
}