import crypto from 'crypto';
import { Repository } from 'typeorm';
import { AppDataSource } from '../config/database';
import { GroupSession, GroupSessionStatus } from '../entities/groupSession.entity';
import { GroupParticipant, ParticipantStatus } from '../entities/groupParticipant.entity';
import { PrintJob } from '../entities/printJob.entity';
import { File } from '../entities/file.entity';
// Watermarking is permanently removed from the group printing flow.
// Participant documents are printed as-is. The watermark queue/worker
// is no longer driven from here.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode(length: number): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export interface SessionOptions {
  paper: string;
  color: 'bw' | 'color';
  sided: 'single' | 'double';
  qualityDpi: 100 | 300 | 600;
  /** Default page orientation the host picked. Participants inherit this
   *  unless they override (in non-enforced sessions). */
  orientation: 'portrait' | 'landscape';
  enforce: boolean;
}

/** Accepts either the new {paper,color,...} shape or the legacy
 * {paperSize,colorType,isDuplex,enforceSettings} shape and normalizes it. */
function normalizeOptions(raw: any): SessionOptions {
  const r = raw || {};
  const color =
    r.color === 'color' || r.colorType === 'color' || r.colorType === 'COLOR' ? 'color' : 'bw';
  const sided = r.sided === 'double' || r.isDuplex === true ? 'double' : 'single';
  const dpi = [100, 300, 600].includes(Number(r.qualityDpi))
    ? (Number(r.qualityDpi) as 100 | 300 | 600)
    : 300;
  return {
    paper: r.paper || r.paperSize || 'A4',
    color,
    sided,
    qualityDpi: dpi,
    orientation: r.orientation === 'landscape' ? 'landscape' : 'portrait',
    enforce: Boolean(r.enforce ?? r.enforceSettings ?? false),
  };
}

export interface CreateGroupSessionInput {
  hostId: string;
  groupName: string;
  deadline: Date;
  sharedSettings: any;
  // `watermarkPrefix` accepted-and-ignored for back-compat with older
  // hosts; watermarking is no longer applied.
  watermarkPrefix?: string;
}

export class GroupSessionService {
  private sessionRepo: Repository<GroupSession>;
  private participantRepo: Repository<GroupParticipant>;
  private printJobRepo: Repository<PrintJob>;
  private fileRepo: Repository<File>;

  constructor() {
    this.sessionRepo = AppDataSource.getRepository(GroupSession);
    this.participantRepo = AppDataSource.getRepository(GroupParticipant);
    this.printJobRepo = AppDataSource.getRepository(PrintJob);
    this.fileRepo = AppDataSource.getRepository(File);
  }

  async createSession(input: CreateGroupSessionInput): Promise<{
    session: GroupSession;
    shareUrl: string;
    shareId: string;
  }> {
    if (input.deadline.getTime() <= Date.now()) {
      throw new Error('Deadline must be in the future');
    }
    const maxDeadline = new Date();
    maxDeadline.setDate(maxDeadline.getDate() + 7);
    if (input.deadline > maxDeadline) {
      throw new Error('Deadline cannot be more than 7 days from now');
    }

    const shareId = makeCode(8);
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const shareUrl = `${baseUrl}/join/${shareId}`;

    const session = this.sessionRepo.create({
      hostUserId: input.hostId,
      groupName: input.groupName,
      deadline: input.deadline,
      status: GroupSessionStatus.OPEN,
      shareUrl,
      shareId,
      // Persisted for schema back-compat but never read at print time.
      watermarkPrefix: input.watermarkPrefix || shareId,
      defaultOptions: normalizeOptions(input.sharedSettings),
    });

    const saved = await this.sessionRepo.save(session);
    return { session: saved, shareUrl, shareId };
  }

  async getSessionByShareId(shareId: string): Promise<GroupSession | null> {
    return this.sessionRepo.findOne({ where: { shareId } });
  }

  async joinSession(input: {
    shareId: string;
    name: string;
    email?: string;
    phoneNumber?: string;
    userId?: string;
  }): Promise<{
    participant: GroupParticipant;
    uploadToken: string;
    session: GroupSession;
  }> {
    const session = await this.sessionRepo.findOne({ where: { shareId: input.shareId } });
    if (!session) throw new Error('Group session not found');
    if (session.status !== GroupSessionStatus.OPEN) throw new Error('This group session is closed');
    if (new Date() > session.deadline)
      throw new Error('The deadline for this group session has passed');

    // Only match on identifiers that were actually provided — a
    // `{ phoneNumber: undefined }` clause silently collapses to "any
    // participant in this session", which would attach every later joiner
    // to the first one.
    const dedupe: Array<Record<string, any>> = [];
    if (input.email) dedupe.push({ groupSessionId: session.id, email: input.email });
    if (input.phoneNumber)
      dedupe.push({ groupSessionId: session.id, phoneNumber: input.phoneNumber });
    if (dedupe.length) {
      const existing = await this.participantRepo.findOne({ where: dedupe });
      if (existing) {
        return { participant: existing, uploadToken: existing.uploadToken, session };
      }
    }

    const uploadToken = crypto.randomBytes(32).toString('base64url');

    const participant = this.participantRepo.create({
      groupSessionId: session.id,
      userId: input.userId,
      name: input.name,
      email: input.email,
      phoneNumber: input.phoneNumber,
      // Watermarking removed — column kept nullable in the schema for
      // backward compat but never populated.
      watermarkId: null,
      uploadToken,
      status: ParticipantStatus.JOINED,
      joinedAt: new Date(),
    });

    const saved = await this.participantRepo.save(participant);
    return { participant: saved, uploadToken, session };
  }

  async getParticipantByToken(uploadToken: string): Promise<{
    participant: GroupParticipant;
    session: GroupSession;
  } | null> {
    const participant = await this.participantRepo.findOne({ where: { uploadToken } });
    if (!participant) return null;
    const session = await this.sessionRepo.findOne({ where: { id: participant.groupSessionId } });
    if (!session) return null;
    return { participant, session };
  }

  async linkFileToParticipant(
    uploadToken: string,
    printJobId: string,
    fileId: string
  ): Promise<GroupParticipant> {
    const result = await this.getParticipantByToken(uploadToken);
    if (!result) throw new Error('Invalid upload token');
    const { participant, session } = result;
    if (session.status !== GroupSessionStatus.OPEN) throw new Error('Group session is closed');

    await this.fileRepo.update(fileId, { participantId: participant.id });

    participant.printJobId = printJobId;
    participant.status = ParticipantStatus.UPLOADED;
    participant.uploadedAt = new Date();
    const saved = await this.participantRepo.save(participant);

    // Watermarking removed — file is printed as-is.

    return saved;
  }

  async markParticipantPaid(printJobId: string): Promise<GroupParticipant | null> {
    const participant = await this.participantRepo.findOne({ where: { printJobId } });
    if (!participant) return null;
    participant.status = ParticipantStatus.PAID;
    participant.paidAt = new Date();
    return this.participantRepo.save(participant);
  }

  async getSessionDetails(
    sessionId: string,
    hostId: string
  ): Promise<{
    session: GroupSession;
    participants: GroupParticipant[];
    summary: {
      totalParticipants: number;
      uploaded: number;
      paid: number;
      totalPages: number;
      totalAmountPaid: number;
    };
  } | null> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session || session.hostUserId !== hostId) return null;

    const participants = await this.participantRepo.find({
      where: { groupSessionId: sessionId },
      order: { createdAt: 'ASC' },
    });

    const paidParticipants = participants.filter((p) => p.status === ParticipantStatus.PAID);
    const printJobIds = paidParticipants.map((p) => p.printJobId).filter(Boolean) as string[];

    let totalPages = 0;
    let totalAmountPaid = 0;
    if (printJobIds.length > 0) {
      const jobs = await this.printJobRepo.findByIds(printJobIds);
      totalPages = jobs.reduce((s, j) => s + (j.totalPages || 0), 0);
      totalAmountPaid = jobs.reduce((s, j) => s + Number(j.cost || 0), 0);
    }

    return {
      session,
      participants,
      summary: {
        totalParticipants: participants.length,
        uploaded: participants.filter(
          (p) => p.status === ParticipantStatus.UPLOADED || p.status === ParticipantStatus.PAID
        ).length,
        paid: paidParticipants.length,
        totalPages,
        totalAmountPaid,
      },
    };
  }

  async closeSession(
    sessionId: string,
    hostId: string | null
  ): Promise<{ session: GroupSession; batchToken: string; batchCode: string }> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new Error('Session not found');
    if (hostId && session.hostUserId && session.hostUserId !== hostId)
      throw new Error('Only the host can close the session');
    if (session.status === GroupSessionStatus.CLOSED) throw new Error('Session is already closed');

    const batchToken = crypto.randomBytes(32).toString('base64url');
    const batchCode = makeCode(6); // group authentication code — 6 chars

    session.status = GroupSessionStatus.CLOSED;
    session.batchToken = batchToken;
    session.batchCode = batchCode;
    session.closedAt = new Date();

    const saved = await this.sessionRepo.save(session);
    return { session: saved, batchToken, batchCode };
  }

  async getBatchPrintData(batchCode: string): Promise<{
    session: GroupSession;
    files: Array<{
      fileId: string;
      fileURL: string;
      participantName: string;
      printConfig: any;
      totalPages: number;
    }>;
  } | null> {
    const session = await this.sessionRepo.findOne({ where: { batchCode } });
    if (!session || session.status !== GroupSessionStatus.CLOSED) return null;

    const paidParticipants = await this.participantRepo.find({
      where: { groupSessionId: session.id, status: ParticipantStatus.PAID },
    });

    const printJobIds = paidParticipants.map((p) => p.printJobId).filter(Boolean) as string[];
    if (printJobIds.length === 0) return { session, files: [] };

    const jobs = await this.printJobRepo.findByIds(printJobIds);
    const fileIds = jobs.map((j) => j.fileId).filter(Boolean) as string[];
    const files = await this.fileRepo.findByIds(fileIds);

    const fileData = paidParticipants
      .map((participant) => {
        const job = jobs.find((j) => j.id === participant.printJobId);
        const file = job ? files.find((f) => f.id === job.fileId) : undefined;
        if (!job || !file) return null;
        return {
          fileId: file.id,
          // Watermarking is gone — always serve the original URL.
          fileURL: file.fileURL,
          participantName: participant.name,
          printConfig: job.printConfiguration,
          totalPages: job.totalPages || 0,
        };
      })
      .filter(Boolean) as Array<{
      fileId: string;
      fileURL: string;
      participantName: string;
      printConfig: any;
      totalPages: number;
    }>;

    return { session, files: fileData };
  }

  async listHostSessions(hostId: string): Promise<GroupSession[]> {
    return this.sessionRepo.find({
      where: { hostUserId: hostId },
      order: { createdAt: 'DESC' },
    });
  }

  async autoCloseExpiredSessions(): Promise<number> {
    const expired = await this.sessionRepo
      .createQueryBuilder('session')
      .where('session.status = :status', { status: GroupSessionStatus.OPEN })
      .andWhere('session.deadline < :now', { now: new Date() })
      .getMany();

    let closedCount = 0;
    for (const session of expired) {
      try {
        await this.closeSession(session.id, session.hostUserId);
        closedCount++;
      } catch (err) {
        console.error(`Failed to auto-close session ${session.id}:`, err);
      }
    }
    return closedCount;
  }
}
