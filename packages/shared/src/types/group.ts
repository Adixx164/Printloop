/**
 * Group Session Types
 * Extracted from printloop-new-frontend/src/store/services/groupApi.ts
 */

export interface GroupSession {
  id: string;
  hostId: string;
  name: string;
  description: string | null;
  status: "active" | "closed" | "expired";
  createdAt: string;
  expiresAt: string;
  host: {
    id: string;
    firstName: string;
    lastName: string;
  };
  participants: Array<{
    id: string;
    userId: string;
    firstName: string;
    lastName: string;
    email: string;
    joinedAt: string;
  }>;
  jobs: Array<{
    id: string;
    code: string;
    status: string;
    pages: number;
    price: number;
  }>;
}

export interface GroupSessionListResponse {
  sessions: GroupSession[];
}

export interface CreateGroupSessionPayload {
  name: string;
  description?: string;
  expiresInMinutes?: number;
}

export interface CreateGroupSessionResponse {
  id: string;
  hostId: string;
  inviteUrl: string;
  shareCode: string;
}

export interface GroupSessionDetailPayload {
  id: string;
  hostId: string;
}

export interface CloseGroupSessionPayload {
  id: string;
  hostId: string;
}