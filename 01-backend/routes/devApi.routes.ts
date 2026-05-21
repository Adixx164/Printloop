import { randomBytes, randomUUID, createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { IppService } from "../services/ipp.service.js";
import { saveBuffer } from "../utils/fileStore.js";
import { verifyToken } from "../utils/jwt.js";
import { evaluatePrintPolicy, ippConnectionPrefs } from "../services/printPolicy.service.js";

type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  passwordHash: string;
  salt: string;
  isEmailVerified: boolean;
  verificationToken?: string;
  resetToken?: string;
  role?: 'user' | 'admin' | 'super_admin';
  adminPrivileges?: string[];
  createdAt: string;
};

type Session = {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  refreshExpiresAt: string;
};

type Transaction = {
  id: string;
  type: "topup" | "print" | "refund" | "credit";
  amount: number;
  description: string;
  balance: number;
  createdAt: string;
};

type Wallet = {
  userId: string;
  balance: number;
  transactions: Transaction[];
};

type PrintJob = {
  id: string;
  userId: string;
  fileName: string;
  pageCount: number;
  code: string;
  cost: number;
  status: "ready" | "done" | "expired" | "refunded" | "printing" | "failed";
  jobType?: "single" | "personal_batch" | "group_batch";
  paymentMethod?: "wallet" | "card" | "transfer" | "ussd";
  refundedAt?: string;
  kioskId?: string;
  createdAt: string;
  expiresAt: string;
  printConfiguration: {
    copies: number;
    paper: string;
    color: "bw" | "color";
    sided: "single" | "double";
    qualityDpi: 100 | 300 | 600;
    pages: "all" | "range";
    pageRange?: string;
  };
};

type GroupParticipant = {
  id: string;
  name: string;
  documentName: string;
  pages: number;
  paymentStatus: "paid" | "unpaid";
  printStatus: "queued" | "printed" | "failed";
  watermarkId: string;
};

type GroupSession = {
  id: string;
  hostUserId: string;
  groupName: string;
  deadline: string;
  status: "open" | "closed";
  shareUrl: string;
  batchCode?: string;
  createdAt: string;
  defaultOptions: {
    paper: string;
    color: "bw" | "color";
    sided: "single" | "double";
    qualityDpi: 100 | 300 | 600;
    enforce: boolean;
  };
  participants: GroupParticipant[];
};

type Station = {
  id: string;
  name: string;
  area: string;
  distanceMeters: number;
  status: "online" | "offline";
  queue: number;
  ipAddress?: string;
};

type DevDb = {
  users: User[];
  sessions: Session[];
  wallets: Wallet[];
  printJobs: PrintJob[];
  stations: Station[];
  groupSessions: GroupSession[];
  pricing?: any[];
  systemSettings?: Record<string, string>;
};

type AuthedRequest = Request & { user?: User };

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const routeDir = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(routeDir, "../data/dev-store.json");

function passwordDigest(password: string, salt = randomBytes(16).toString("hex")) {
  return {
    salt,
    passwordHash: createHash("sha256").update(`${salt}:${password}`).digest("hex"),
  };
}

function makeCode(length = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function makeOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function publicUser(user: User) {
  const { passwordHash, salt, verificationToken, resetToken, ...safeUser } = user;
  void passwordHash;
  void salt;
  void verificationToken;
  void resetToken;
  return {
    ...safeUser,
    role: safeUser.role || 'user',
    adminPrivileges: safeUser.adminPrivileges || [],
  };
}

function seedDb(): DevDb {
  const now = new Date();
  const demoPassword = passwordDigest("Password1!");
  const adminPassword = passwordDigest("Admin1234!");
  const demoUser: User = {
    id: "usr_demo_student",
    firstName: "Demo",
    lastName: "Student",
    email: "student@printloop.test",
    phoneNumber: "+2348000000000",
    isEmailVerified: true,
    role: 'user',
    adminPrivileges: [],
    createdAt: now.toISOString(),
    ...demoPassword,
  };
  const adminUser: User = {
    id: "usr_super_admin",
    firstName: "Print",
    lastName: "Admin",
    email: "admin@printloop.test",
    phoneNumber: "+2348000000001",
    isEmailVerified: true,
    role: 'super_admin',
    adminPrivileges: ['manage_pricing','manage_kiosks','manage_users','manage_admins','view_logs','view_reports'],
    createdAt: now.toISOString(),
    ...adminPassword,
  };

  const jobs: PrintJob[] = [
    {
      id: "job_csc_401",
      userId: demoUser.id,
      fileName: "CSC 401 - Week 9 lecture notes.pdf",
      pageCount: 12,
      code: "M7K3X9",
      cost: 60,
      status: "ready",
      jobType: "single",
      paymentMethod: "wallet",
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      printConfiguration: { copies: 1, paper: "A4", color: "bw", sided: "single", qualityDpi: 300, pages: "all" },
    },
    {
      id: "job_project_proposal",
      userId: demoUser.id,
      fileName: "Project proposal - draft 3.docx",
      pageCount: 8,
      code: "T2L8B4",
      cost: 200,
      status: "done",
      jobType: "single",
      paymentMethod: "wallet",
      kioskId: "st_yaba",
      createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(now.getTime() - 23 * 60 * 60 * 1000).toISOString(),
      printConfiguration: { copies: 1, paper: "A4", color: "color", sided: "single", qualityDpi: 600, pages: "all" },
    },
    {
      id: "job_nysc_form",
      userId: demoUser.id,
      fileName: "NYSC application form.pdf",
      pageCount: 2,
      code: "A9P1Q5",
      cost: 10,
      status: "done",
      jobType: "single",
      paymentMethod: "wallet",
      kioskId: "st_unilag_arts",
      createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(),
      printConfiguration: { copies: 1, paper: "A4", color: "bw", sided: "single", qualityDpi: 300, pages: "all" },
    },
  ];

  return {
    users: [demoUser, adminUser],
    sessions: [],
    wallets: [
      {
        userId: demoUser.id,
        balance: 2450,
        transactions: [
          {
            id: "txn_seed_topup",
            type: "topup",
            amount: 2000,
            description: "Paystack top-up",
            balance: 2450,
            createdAt: now.toISOString(),
          },
          {
            id: "txn_seed_print",
            type: "print",
            amount: -60,
            description: "CSC 401 - Week 9 notes",
            balance: 450,
            createdAt: new Date(now.getTime() - 90 * 60 * 1000).toISOString(),
          },
        ],
      },
    ],
    printJobs: jobs,
    stations: [
      { id: "st_yaba", name: "Yaba Station", area: "Yaba, Lagos", distanceMeters: 240, status: "online", queue: 2, ipAddress: "192.168.1.100" },
      { id: "st_unilag_arts", name: "UNILAG - Faculty of Arts", area: "Akoka", distanceMeters: 1200, status: "online", queue: 0 },
      { id: "st_unilag_sports", name: "UNILAG - Sports Centre", area: "Akoka", distanceMeters: 1400, status: "online", queue: 5 },
      { id: "st_akoka", name: "Akoka Junction", area: "Akoka", distanceMeters: 1800, status: "online", queue: 1 },
      { id: "st_bariga", name: "Bariga Print Hub", area: "Bariga", distanceMeters: 2100, status: "offline", queue: 0 },
      { id: "st_surulere", name: "Surulere Plaza", area: "Surulere", distanceMeters: 5600, status: "online", queue: 0 },
    ],
    groupSessions: [
      {
        id: "grp_csc_301",
        hostUserId: demoUser.id,
        groupName: "CSC 301 Assignment 2",
        deadline: new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString(),
        status: "open",
        shareUrl: "/groups/grp_csc_301/join",
        createdAt: now.toISOString(),
        defaultOptions: { paper: "A4", color: "bw", sided: "double", qualityDpi: 300, enforce: true },
        participants: [
          { id: "prt_001", name: "Amina Yusuf", documentName: "Amina CSC301.pdf", pages: 6, paymentStatus: "paid", printStatus: "queued", watermarkId: "CSC301-001" },
          { id: "prt_002", name: "Tunde Okafor", documentName: "Tunde Assignment.docx", pages: 9, paymentStatus: "paid", printStatus: "queued", watermarkId: "CSC301-002" },
        ],
      },
    ],
  };
}

function loadDb(): DevDb {
  if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, JSON.stringify(seedDb(), null, 2));
  }

  const parsed = JSON.parse(fs.readFileSync(dbPath, "utf8")) as DevDb;
  parsed.sessions = parsed.sessions || [];
  parsed.wallets = parsed.wallets || [];
  parsed.printJobs = parsed.printJobs || [];
  parsed.printJobs = parsed.printJobs.map((job) => ({
    ...job,
    jobType: job.jobType || "single",
    paymentMethod: job.paymentMethod || "wallet",
    expiresAt:
      new Date(job.expiresAt).getTime() - new Date(job.createdAt).getTime() < 23 * 60 * 60 * 1000
        ? new Date(new Date(job.createdAt).getTime() + 24 * 60 * 60 * 1000).toISOString()
        : job.expiresAt,
    printConfiguration: {
      ...job.printConfiguration,
      qualityDpi: job.printConfiguration.qualityDpi || 300,
    },
  }));
  parsed.stations = parsed.stations || seedDb().stations;
  parsed.groupSessions = parsed.groupSessions || seedDb().groupSessions;
  return parsed;
}

let db = loadDb();

function saveDb() {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function findUserByEmail(email: string) {
  return db.users.find((user) => user.email.toLowerCase() === email.trim().toLowerCase());
}

function walletFor(userId: string) {
  let wallet = db.wallets.find((item) => item.userId === userId);
  if (!wallet) {
    wallet = { userId, balance: 0, transactions: [] };
    db.wallets.push(wallet);
  }
  return wallet;
}

function refreshExpiredJobs() {
  let changed = false;

  for (const job of db.printJobs) {
    if (job.status !== "ready" || new Date(job.expiresAt).getTime() > Date.now()) continue;

    const wallet = walletFor(job.userId);
    wallet.balance += job.cost;
    job.status = "refunded";
    job.refundedAt = new Date().toISOString();
    wallet.transactions.unshift({
      id: randomUUID(),
      type: "refund",
      amount: job.cost,
      description: `Auto-refund for expired print code ${job.code}`,
      balance: wallet.balance,
      createdAt: job.refundedAt,
    });
    changed = true;
  }

  if (changed) saveDb();
}

function createSession(userId: string) {
  const session: Session = {
    userId,
    accessToken: randomBytes(24).toString("hex"),
    refreshToken: randomBytes(32).toString("hex"),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    refreshExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };

  db.sessions = db.sessions.filter((item) => item.userId !== userId);
  db.sessions.push(session);
  saveDb();
  return session;
}

function tokensFromSession(session: Session) {
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: session.expiresAt,
  };
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.header("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";

  const session = db.sessions.find((item) => item.accessToken === token);
  if (session && new Date(session.expiresAt).getTime() >= Date.now()) {
    const user = db.users.find((item) => item.id === session.userId);
    if (user) {
      req.user = user;
      next();
      return;
    }
  }

  // Bridge: accept a real customer JWT (issued by /api/customer/auth) so the
  // remaining mock endpoints (wallet, stations, options) keep working once a
  // customer is authenticated against the real backend.
  if (token) {
    try {
      const payload = verifyToken(token) as { userId?: string; role?: string };
      if (payload?.userId) {
        req.user = {
          id: payload.userId,
          role: (payload.role as any) || "user",
          email: "",
          firstName: "",
          lastName: "",
          phoneNumber: "",
          isEmailVerified: true,
          passwordHash: "",
          salt: "",
          createdAt: new Date().toISOString(),
        } as any;
        next();
        return;
      }
    } catch {
      /* fall through to 401 */
    }
  }

  res.status(401).json({ success: false, message: "Authentication required" });
}

/** Blocks anyone who isn't admin or super_admin — use on all /admin/* routes */
function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'super_admin') {
      res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
      return;
    }
    next();
  });
}

/** Require a specific privilege (super_admin always passes) */
function requirePrivilege(privilege: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    requireAdmin(req, res, () => {
      if (req.user!.role === 'super_admin') { next(); return; }
      if (!(req.user!.adminPrivileges || []).includes(privilege)) {
        res.status(403).json({ success: false, message: `Missing privilege: ${privilege}` });
        return;
      }
      next();
    });
  };
}

function calculateCost(input: { pageCount: number; copies: number; color: "bw" | "color"; sided: "single" | "double"; qualityDpi?: 100 | 300 | 600 }) {
  const perPage = input.color === "color" ? 25 : 5;
  const duplexDiscount = input.sided === "double" ? 0.85 : 1;
  const qualityMultiplier = input.qualityDpi === 600 ? 1.2 : input.qualityDpi === 100 ? 0.8 : 1;
  return Math.max(5, Math.round(input.pageCount * input.copies * perPage * duplexDiscount * qualityMultiplier));
}

function formatJob(job: PrintJob) {
  return {
    ...job,
    title: job.fileName.replace(/\.[^.]+$/, ""),
    qrPayload: `printloop://release/${job.code}`,
    meta: `${job.pageCount}pp · ${job.printConfiguration.paper} · ${job.printConfiguration.color === "color" ? "Colour" : "B&W"} · ${job.printConfiguration.qualityDpi || 300}dpi`,
  };
}

router.post("/auth/register", (req, res) => {
  const { firstName, lastName, email, phoneNumber, password } = req.body || {};

  if (!firstName || !lastName || !email || !phoneNumber || !password) {
    res.status(400).json({ success: false, message: "All registration fields are required" });
    return;
  }

  if (findUserByEmail(email)) {
    res.status(409).json({ success: false, message: "An account with this email already exists" });
    return;
  }

  const verificationToken = makeOtp();
  const passwordBits = passwordDigest(String(password));
  const user: User = {
    id: randomUUID(),
    firstName,
    lastName,
    email: String(email).trim().toLowerCase(),
    phoneNumber,
    isEmailVerified: false,
    verificationToken,
    createdAt: new Date().toISOString(),
    ...passwordBits,
  };

  db.users.push(user);
  db.wallets.push({ userId: user.id, balance: 500, transactions: [] });
  saveDb();

  res.status(201).json({
    success: true,
    message: "Account created. Use the dev verification code to continue.",
    data: { user: publicUser(user), verificationToken },
  });
});

router.post("/auth/verify-email", (req, res) => {
  const { email, token } = req.body || {};
  const user = email ? findUserByEmail(email) : null;

  if (!user) {
    res.status(404).json({ success: false, message: "Account not found" });
    return;
  }

  if (user.verificationToken !== token && token !== "123456") {
    res.status(400).json({ success: false, message: "Invalid verification code" });
    return;
  }

  user.isEmailVerified = true;
  delete user.verificationToken;
  saveDb();
  res.json({ success: true, message: "Email verified", data: { user: publicUser(user) } });
});

router.post("/auth/send-verification-email", (req, res) => {
  const { email } = req.body || {};
  const user = email ? findUserByEmail(email) : null;

  if (!user) {
    res.status(404).json({ success: false, message: "Account not found" });
    return;
  }

  user.verificationToken = makeOtp();
  saveDb();
  res.json({
    success: true,
    message: "Verification code generated",
    data: { verificationToken: user.verificationToken },
  });
});

router.post("/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const user = email ? findUserByEmail(email) : null;

  if (!user || !password) {
    res.status(401).json({ success: false, message: "Invalid email or password" });
    return;
  }

  const attempted = passwordDigest(String(password), user.salt).passwordHash;
  if (attempted !== user.passwordHash) {
    res.status(401).json({ success: false, message: "Invalid email or password" });
    return;
  }

  if (!user.isEmailVerified) {
    res.status(403).json({ success: false, message: "Please verify your email before signing in" });
    return;
  }

  const session = createSession(user.id);
  res.json({
    success: true,
    data: {
      user: publicUser(user),
      tokens: tokensFromSession(session),
    },
  });
});

router.post("/auth/refresh", (req, res) => {
  const refreshToken = req.body?.refreshToken;
  const session = db.sessions.find((item) => item.refreshToken === refreshToken);

  if (!session || new Date(session.refreshExpiresAt).getTime() < Date.now()) {
    res.status(401).json({ success: false, message: "Refresh token expired" });
    return;
  }

  session.accessToken = randomBytes(24).toString("hex");
  session.expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  saveDb();

  const user = db.users.find((item) => item.id === session.userId);
  res.json({
    success: true,
    data: {
      user: user ? publicUser(user) : null,
      tokens: tokensFromSession(session),
    },
  });
});

router.post("/auth/forgot-password", (req, res) => {
  const { email } = req.body || {};
  const user = email ? findUserByEmail(email) : null;

  if (user) {
    user.resetToken = makeOtp();
    saveDb();
  }

  res.json({
    success: true,
    message: "If that account exists, a reset code has been generated.",
    data: user?.resetToken ? { resetToken: user.resetToken } : undefined,
  });
});

router.post("/auth/reset-password", (req, res) => {
  const { email, token, password } = req.body || {};
  const user = email ? findUserByEmail(email) : null;

  if (!user || (user.resetToken !== token && token !== "123456")) {
    res.status(400).json({ success: false, message: "Invalid reset code" });
    return;
  }

  Object.assign(user, passwordDigest(String(password)));
  delete user.resetToken;
  saveDb();
  res.json({ success: true, message: "Password reset" });
});

router.get("/auth/me", requireAuth, (req: AuthedRequest, res) => {
  res.json({ success: true, data: publicUser(req.user!) });
});

router.get("/print-jobs/options", requireAuth, (_req, res) => {
  res.json({
    success: true,
    data: {
      paperSizes: ["A4", "A3", "Letter"],
      colors: ["bw", "color"],
      sides: ["single", "double"],
      qualityOptions: [100, 300, 600],
      paymentMethods: ["wallet", "card", "transfer", "ussd"],
      pricing: {
        bwPerPage: 5,
        colorPerPage: 25,
        duplexDiscount: 0.85,
        qualityMultipliers: { "100": 0.8, "300": 1, "600": 1.2 },
      },
    },
  });
});

router.get("/print-jobs", requireAuth, (req: AuthedRequest, res) => {
  refreshExpiredJobs();
  const status = req.query.status?.toString();
  const jobs = db.printJobs
    .filter((job) => job.userId === req.user!.id)
    .filter((job) => !status || status === "all" || job.status === status)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(formatJob);

  res.json({ success: true, data: { jobs, total: jobs.length } });
});

router.post("/print-jobs", requireAuth, (req: AuthedRequest, res) => {
  const body = req.body || {};
  const config = body.printConfiguration || body.config || {};
  const pageCount = Math.max(1, Number(body.pageCount || body.totalPages || 10));
  const copies = Math.max(1, Number(config.copies || body.copies || 1));
  const color = config.color === "color" || config.colorType === "color" ? "color" : "bw";
  const sided = config.sided === "double" || config.isDuplex ? "double" : "single";
  const qualityDpi = [100, 300, 600].includes(Number(config.qualityDpi)) ? Number(config.qualityDpi) as 100 | 300 | 600 : 300;
  const paymentMethod = ["wallet", "card", "transfer", "ussd"].includes(body.paymentMethod) ? body.paymentMethod : "wallet";
  const jobType = body.jobType === "personal_batch" ? "personal_batch" : "single";
  const cost = calculateCost({ pageCount, copies, color, sided, qualityDpi });
  const wallet = walletFor(req.user!.id);

  if (paymentMethod === "wallet" && wallet.balance < cost) {
    res.status(402).json({ success: false, message: "Insufficient wallet balance. Top up and try again." });
    return;
  }

  if (paymentMethod === "wallet") wallet.balance -= cost;
  const title = body.fileName || body.title || "Untitled document.pdf";
  const job: PrintJob = {
    id: randomUUID(),
    userId: req.user!.id,
    fileName: title,
    pageCount,
    code: makeCode(),
    cost,
    status: "ready",
    jobType,
    paymentMethod,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    printConfiguration: {
      copies,
      paper: config.paper || config.paperSize || "A4",
      color,
      sided,
      qualityDpi,
      pages: config.pages || "all",
      pageRange: config.pageRange,
    },
  };

  db.printJobs.push(job);
  wallet.transactions.unshift({
    id: randomUUID(),
    type: "print",
    amount: -cost,
    description: `${job.fileName.replace(/\.[^.]+$/, "")} (${paymentMethod})`,
    balance: wallet.balance,
    createdAt: job.createdAt,
  });
  saveDb();

  res.status(201).json({ success: true, data: { job: formatJob(job), wallet } });
});

router.post("/files/upload", requireAuth, upload.single("file"), (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ success: false, message: "No file uploaded" });
    return;
  }

  const stored = saveBuffer(file.buffer, file.originalname);
  res.status(201).json({
    success: true,
    data: {
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      // Real, fetchable URL (served by GET /api/files/:key) so the
      // kiosk/IPP service can actually retrieve the document bytes.
      fileURL: stored.url,
    },
  });
});

router.get("/wallet", requireAuth, (req: AuthedRequest, res) => {
  const wallet = walletFor(req.user!.id);
  res.json({ success: true, data: wallet });
});

router.post("/wallet/top-up", requireAuth, (req: AuthedRequest, res) => {
  const amount = Number(req.body?.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ success: false, message: "Top-up amount must be greater than zero" });
    return;
  }

  const wallet = walletFor(req.user!.id);
  wallet.balance += amount;
  wallet.transactions.unshift({
    id: randomUUID(),
    type: "topup",
    amount,
    description: "Paystack top-up",
    balance: wallet.balance,
    createdAt: new Date().toISOString(),
  });
  saveDb();

  res.json({ success: true, data: wallet });
});

router.post("/wallet/top-up/initialize", requireAuth, (req: AuthedRequest, res) => {
  const amount = Number(req.body?.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ success: false, message: "Invalid amount" });
    return;
  }
  
  // In dev/mock mode, we return a dummy URL that just simulates a successful paystack checkout
  res.json({
    success: true,
    data: {
      authorizationUrl: `https://checkout.paystack.com/dummy_${Date.now()}`,
      reference: `dummy_${Date.now()}`,
    }
  });
});

router.get("/stations", requireAuth, (_req, res) => {
  res.json({ success: true, data: { stations: db.stations } });
});



router.post("/kiosk/release", async (req, res) => {
  refreshExpiredJobs();
  const code = String(req.body?.code || "").trim().toUpperCase();
  const job = db.printJobs.find((item) => item.code === code);

  if (!job) {
    res.status(404).json({ success: false, message: "Print code not found" });
    return;
  }

  if (job.status !== "ready") {
    res.status(409).json({ success: false, message: `This job is ${job.status}` });
    return;
  }

  const cfg: any = job.printConfiguration || {};

  // ── Print-script policy: evaluate BEFORE anything is dispatched ────────
  const policy = await evaluatePrintPolicy({
    totalPages: Number(job.pageCount) || 1,
    copies: Number(cfg.copies) || 1,
    color: cfg.color === "color" ? "color" : "bw",
    sided: cfg.sided === "double" ? "double" : "single",
    paper: cfg.paper || "A4",
    fileName: job.fileName,
    jobType: job.jobType,
  });

  if (!policy.allow) {
    res.status(403).json({
      success: false,
      message: policy.deniedReason || "Blocked by print policy.",
      code: "PRINT_POLICY_DENIED",
    });
    return;
  }

  job.kioskId = req.body?.kioskId || "st_yaba";
  const station = db.stations.find((st) => st.id === job.kioskId);

  if (station && station.ipAddress) {
    try {
      const ipp = new IppService();
      // Expand a "2-3,10-20" style range to a page list for IPP page-ranges
      let pages: number[] | null = null;
      if (cfg.pages === "range" && cfg.pageRange) {
        pages = [];
        for (const chunk of String(cfg.pageRange).split(",")) {
          const m = chunk.trim().match(/^(\d+)\s*-\s*(\d+)$/);
          if (m) for (let p = +m[1]; p <= +m[2]; p++) pages.push(p);
          else if (/^\d+$/.test(chunk.trim())) pages.push(+chunk.trim());
        }
      }
      const prefs = await ippConnectionPrefs();
      const opts = {
        // policy may have forced mono / duplex / clamped copies
        copies: policy.mutated.copies,
        sided: policy.mutated.sided,
        color: policy.mutated.color,
        paper: policy.mutated.paper || "A4",
        collate: cfg.collate !== false, // batches collate by default
        pages,
        requestingUser: "PrintLoop-Kiosk",
        secure: prefs.secure,
        port: prefs.port,
        tlsRejectUnauthorized: prefs.rejectUnauthorized,
      };
      const dummyFileUrl =
        "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";

      console.log(
        `[Release] ${job.code} → ${station.name} (${station.ipAddress}) ${prefs.secure ? "IPPS" : "IPP"}`,
        opts,
        policy.notes.length ? `· policy: ${policy.notes.join("; ")}` : ""
      );
      ipp
        .printJob(station.ipAddress, { url: dummyFileUrl }, job.fileName, opts)
        .then((r: any) =>
          console.log(`[Release] IPP accepted ${job.code}`, r?.mock ? "(dev mock)" : r?.["job-attributes-tag"])
        )
        .catch((e: any) => console.error(`[Release] IPP error (printer offline?):`, e.message));
    } catch (e) {
      console.error("[Release] IPP dispatch failed:", e);
    }
  }

  job.status = "done";
  saveDb();

  res.json({
    success: true,
    data: { job: formatJob(job), policyNotes: policy.notes },
  });
});

router.get("/group-sessions", requireAuth, (req: AuthedRequest, res) => {
  const sessions = db.groupSessions
    .filter((session) => session.hostUserId === req.user!.id)
    .map((session) => ({
      ...session,
      totalPages: session.participants.reduce((sum, participant) => sum + participant.pages, 0),
      paidParticipants: session.participants.filter((participant) => participant.paymentStatus === "paid").length,
    }));

  res.json({ success: true, data: { sessions } });
});

router.post("/group-sessions", requireAuth, (req: AuthedRequest, res) => {
  const groupName = String(req.body?.groupName || "Untitled group session");
  const session: GroupSession = {
    id: randomUUID(),
    hostUserId: req.user!.id,
    groupName,
    deadline: req.body?.deadline || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    status: "open",
    shareUrl: `/groups/${encodeURIComponent(groupName.toLowerCase().replace(/\s+/g, "-"))}/join`,
    createdAt: new Date().toISOString(),
    defaultOptions: {
      paper: req.body?.paper || "A4",
      color: req.body?.color === "color" ? "color" : "bw",
      sided: req.body?.sided === "double" ? "double" : "single",
      qualityDpi: [100, 300, 600].includes(Number(req.body?.qualityDpi)) ? Number(req.body.qualityDpi) as 100 | 300 | 600 : 300,
      enforce: Boolean(req.body?.enforce),
    },
    participants: [],
  };

  db.groupSessions.unshift(session);
  saveDb();
  res.status(201).json({ success: true, data: { session } });
});

router.post("/group-sessions/:id/close", requireAuth, (req: AuthedRequest, res) => {
  const session = db.groupSessions.find((item) => item.id === req.params.id && item.hostUserId === req.user!.id);

  if (!session) {
    res.status(404).json({ success: false, message: "Group session not found" });
    return;
  }

  session.status = "closed";
  session.batchCode = session.batchCode || `GP${makeCode(6)}`;
  saveDb();
  res.json({ success: true, data: { session } });
});

// ─── Admin Auth ───────────────────────────────────────────────────────────────

/**
 * POST /admin/auth/login
 * Separate admin login — rejects users without admin/super_admin role.
 * Credentials: admin@printloop.test / Admin1234!
 */
router.post("/admin/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const user = email ? findUserByEmail(email) : null;

  if (!user || !password) {
    res.status(401).json({ success: false, message: "Invalid credentials" });
    return;
  }

  const attempted = passwordDigest(String(password), user.salt).passwordHash;
  if (attempted !== user.passwordHash) {
    res.status(401).json({ success: false, message: "Invalid credentials" });
    return;
  }

  if (user.role !== 'admin' && user.role !== 'super_admin') {
    res.status(403).json({ success: false, message: "Access denied. Admin credentials required." });
    return;
  }

  const session = createSession(user.id);
  res.json({
    success: true,
    data: {
      user: publicUser(user),
      tokens: tokensFromSession(session),
    },
  });
});

/** GET /admin/auth/me — returns the currently authenticated admin profile */
router.get("/admin/auth/me", requireAdmin, (req: AuthedRequest, res) => {
  res.json({ success: true, data: publicUser(req.user!) });
});

// ─── Admin API routes (all require admin role) ───────────────────────────────

router.get("/admin/overview", requireAdmin, (req: AuthedRequest, res) => {
  refreshExpiredJobs();
  const today = new Date().toISOString().slice(0, 10);
  const onlineKiosks = db.stations.filter((station) => station.status === "online").length;
  const pagesToday = db.printJobs
    .filter((job) => job.createdAt.startsWith(today))
    .reduce((sum, job) => sum + job.pageCount * job.printConfiguration.copies, 0);
  const revenueToday = db.printJobs
    .filter((job) => job.createdAt.startsWith(today))
    .reduce((sum, job) => sum + job.cost, 0);

  const admin = {
    metrics: {
      onlineKiosks,
      offlineKiosks: db.stations.length - onlineKiosks,
      pagesToday,
      revenueToday,
      activeUsers: db.users.length,
      recentErrors: db.printJobs.filter((job) => job.status === "failed").length,
    },
    pagesByDay: Array.from({ length: 30 }, (_, index) => ({
      day: new Date(Date.now() - (29 - index) * 24 * 60 * 60 * 1000).toISOString().slice(5, 10),
      pages: 20 + ((index * 17) % 90),
    })),
    kioskIssues: db.stations
      .filter((station) => station.status !== "online" || station.queue >= 5)
      .map((station) => ({ ...station, errorCount: station.status === "offline" ? 3 : 1, pagesLast30Days: 800 + station.queue * 40 })),
    jobs: db.printJobs.map(formatJob),
    groupSessions: db.groupSessions,
    transactions: db.wallets.flatMap((wallet) => wallet.transactions.map((transaction) => ({ ...transaction, userId: wallet.userId }))),
    users: db.users.map((user) => ({
      ...publicUser(user),
      walletBalance: walletFor(user.id).balance,
      totalJobs: db.printJobs.filter((job) => job.userId === user.id).length,
      totalPages: db.printJobs.filter((job) => job.userId === user.id).reduce((sum, job) => sum + job.pageCount, 0),
      role: user.role || 'user',
      adminPrivileges: user.adminPrivileges || []
    })),
    pricing: db.pricing || [
      { id: 1, paper: "A4", bwSingle: 5, bwDuplex: 4, colorSingle: 25, colorDuplex: 21 },
      { id: 2, paper: "A3", bwSingle: 15, bwDuplex: 12, colorSingle: 50, colorDuplex: 42 },
      { id: 3, paper: "Letter", bwSingle: 5, bwDuplex: 4, colorSingle: 25, colorDuplex: 21 },
    ],
    promotions: [
      { id: "promo_exam", name: "Exam week boost", rule: "20 free pages after 100", status: "active", usageCount: 44 },
      { id: "promo_first", name: "First two pages free", rule: "first_print_credit", status: "inactive", usageCount: 128 },
    ],
    reports: [
      { id: "rep_pages", name: "Pages by kiosk", format: "CSV", requestedBy: req.user!.email, createdAt: new Date().toISOString() },
      { id: "rep_revenue", name: "Revenue by campus", format: "CSV", requestedBy: req.user!.email, createdAt: new Date().toISOString() },
    ],
    settings: [
      { key: "documentRetentionHours", value: 24, warning: "Expired jobs are auto-refunded to wallet before deletion." },
      { key: "maxFileSizeMb", value: 50, warning: "Large files can slow kiosk release." },
      { key: "allowedFileTypes", value: "PDF, JPG, PNG", warning: "Changing this affects new uploads only." },
    ],
    roles: [
      { name: "Ops", permissions: ["view_dashboard", "manage_kiosks", "requeue_jobs"] },
      { name: "Finance", permissions: ["view_transactions", "issue_refunds", "export_reports"] },
      { name: "Support", permissions: ["view_users", "credit_wallets", "view_audit"] },
    ],
    auditLog: [
      { id: "aud_1", time: new Date().toISOString(), adminId: req.user!.email, action: "Viewed admin overview", details: "Local dev console" },
      { id: "aud_2", time: new Date(Date.now() - 45 * 60 * 1000).toISOString(), adminId: "ops@printloop.test", action: "Kiosk state change", details: "Bariga Print Hub marked offline" },
    ],
  };

  res.json({ success: true, data: admin });
});

router.put("/admin/pricing", requirePrivilege('manage_pricing'), (req: AuthedRequest, res) => {
  // Update mock database pricing
  db.pricing = req.body;
  saveDb();
  res.json({ success: true, data: db.pricing });
});

router.post("/admin/users/:id/promote", requireAdmin, (req: AuthedRequest, res) => {
  if (req.user!.role !== 'super_admin') {
    res.status(403).json({ success: false, message: "Only Super Admin can promote users" });
    return;
  }

  const targetUser = db.users.find(u => u.id === req.params.id);
  if (!targetUser) return res.status(404).json({ success: false, message: "User not found" });

  targetUser.role = 'admin';
  targetUser.adminPrivileges = [];
  saveDb();
  
  res.json({ success: true, data: publicUser(targetUser) });
});

router.put("/admin/users/:id/privileges", requirePrivilege('manage_admins'), (req: AuthedRequest, res) => {


  const targetUser = db.users.find(u => u.id === req.params.id);
  if (!targetUser) return res.status(404).json({ success: false, message: "User not found" });

  targetUser.adminPrivileges = req.body.privileges || [];
  saveDb();
  
  res.json({ success: true, data: publicUser(targetUser) });
});

// ─── Admin: Kiosk / Printer Management ─────────────────────────────────────

router.get("/admin/kiosks", requireAdmin, (req: AuthedRequest, res) => {
  const { status, search } = req.query as Record<string, string>;
  let kiosks = db.stations.map((s, i) => ({
    ...s,
    printerModel: (s as any).printerModel || "HP LaserJet Pro M404n",
    ipAddress: (s as any).ipAddress || `192.168.1.${100 + i}`,
    totalJobsPrinted: (s as any).totalJobsPrinted || Math.floor(Math.random() * 500 + 100),
    totalPagesPrinted: (s as any).totalPagesPrinted || Math.floor(Math.random() * 5000 + 500),
    lastSeenAt: (s as any).lastSeenAt || new Date(Date.now() - Math.random() * 3600000).toISOString(),
    notes: (s as any).notes || null,
  }));
  if (status) kiosks = kiosks.filter(k => k.status === status);
  if (search) kiosks = kiosks.filter(k =>
    k.name.toLowerCase().includes(search.toLowerCase()) ||
    k.area.toLowerCase().includes(search.toLowerCase())
  );
  res.json({ success: true, data: { kiosks, total: kiosks.length } });
});

router.post("/admin/kiosks", requirePrivilege('manage_kiosks'), (req: AuthedRequest, res) => {
  const { name, area, ipAddress, printerModel, notes } = req.body;
  if (!name) { res.status(400).json({ success: false, message: "Name is required" }); return; }
  const newKiosk = {
    id: `st_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
    name, area: area || '', status: 'online' as const, queue: 0,
    ipAddress: ipAddress || null, printerModel: printerModel || null,
    totalJobsPrinted: 0, totalPagesPrinted: 0,
    lastSeenAt: new Date().toISOString(), notes: notes || null,
    distanceMeters: 0,
  };
  db.stations.push(newKiosk as any);
  saveDb();
  res.status(201).json({ success: true, data: newKiosk });
});

router.patch("/admin/kiosks/:id/status", requirePrivilege('manage_kiosks'), (req: AuthedRequest, res) => {
  const kiosk = db.stations.find(s => s.id === req.params.id) as any;
  if (!kiosk) { res.status(404).json({ success: false, message: "Kiosk not found" }); return; }
  const allowed = ['online', 'offline', 'maintenance'];
  if (!allowed.includes(req.body.status)) {
    res.status(400).json({ success: false, message: `Status must be one of: ${allowed.join(', ')}` }); return;
  }
  kiosk.status = req.body.status;
  if (req.body.notes !== undefined) kiosk.notes = req.body.notes;
  saveDb();
  res.json({ success: true, data: kiosk });
});

router.delete("/admin/kiosks/:id", requirePrivilege('manage_kiosks'), (req: AuthedRequest, res) => {
  const idx = db.stations.findIndex(s => s.id === req.params.id);
  if (idx === -1) { res.status(404).json({ success: false, message: "Kiosk not found" }); return; }
  db.stations.splice(idx, 1);
  saveDb();
  res.json({ success: true, message: "Kiosk removed" });
});

// ─── Admin: Print Jobs Search & Management ─────────────────────────────────

router.get("/admin/jobs", requireAdmin, (req: AuthedRequest, res) => {
  refreshExpiredJobs();
  const { status, userId, search, page = '1', limit = '25' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

  let jobs = db.printJobs.map(formatJob).map(job => ({
    ...job,
    userName: (() => {
      const u = db.users.find(u => u.id === job.userId);
      return u ? `${u.firstName} ${u.lastName}` : 'Unknown';
    })(),
    userEmail: (() => {
      const u = db.users.find(u => u.id === job.userId);
      return u?.email || '';
    })(),
  }));

  if (status) jobs = jobs.filter(j => j.status === status);
  if (userId) jobs = jobs.filter(j => j.userId === userId);
  if (search) {
    const q = search.toLowerCase();
    jobs = jobs.filter(j =>
      j.fileName?.toLowerCase().includes(q) ||
      j.code?.toLowerCase().includes(q) ||
      j.userName?.toLowerCase().includes(q) ||
      j.userEmail?.toLowerCase().includes(q)
    );
  }

  jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const total = jobs.length;
  const items = jobs.slice((pageNum - 1) * limitNum, pageNum * limitNum);

  res.json({
    success: true,
    data: { jobs: items, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) }
  });
});

router.patch("/admin/jobs/:id/status", requireAdmin, (req: AuthedRequest, res) => {
  const job = db.printJobs.find(j => j.id === req.params.id);
  if (!job) { res.status(404).json({ success: false, message: "Job not found" }); return; }
  const allowed = ['ready', 'printing', 'done', 'failed', 'expired', 'refunded'];
  if (!allowed.includes(req.body.status)) {
    res.status(400).json({ success: false, message: "Invalid status" }); return;
  }
  (job as any).status = req.body.status;
  if (req.body.status === 'refunded' && !(job as any).refundedAt) {
    (job as any).refundedAt = new Date().toISOString();
    const wallet = walletFor(job.userId);
    wallet.balance += job.cost;
    wallet.transactions.unshift({
      id: randomUUID(), type: 'refund', amount: job.cost,
      description: `Admin refund for job ${job.code}`,
      balance: wallet.balance, createdAt: new Date().toISOString(),
    });
  }
  saveDb();
  res.json({ success: true, data: formatJob(job) });
});

// ─── Admin: Reports ─────────────────────────────────────────────────────────

router.get("/admin/reports/revenue", requireAdmin, (req: AuthedRequest, res) => {
  const { format = 'json', days = '30' } = req.query as Record<string, string>;
  const daysNum = Math.min(365, Math.max(1, parseInt(days)));
  const rows: { date: string; jobs: number; pages: number; revenue: number }[] = [];

  for (let i = daysNum - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const dayJobs = db.printJobs.filter(j => j.createdAt.startsWith(date));
    rows.push({
      date,
      jobs: dayJobs.length,
      pages: dayJobs.reduce((s, j) => s + j.pageCount * j.printConfiguration.copies, 0),
      revenue: dayJobs.reduce((s, j) => s + j.cost, 0),
    });
  }

  if (format === 'csv') {
    const csv = 'Date,Jobs,Pages,Revenue (NGN)\n' +
      rows.map(r => `${r.date},${r.jobs},${r.pages},${r.revenue}`).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="revenue-${days}d.csv"`);
    res.send(csv);
    return;
  }

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalJobs = rows.reduce((s, r) => s + r.jobs, 0);
  const totalPages = rows.reduce((s, r) => s + r.pages, 0);

  res.json({
    success: true,
    data: {
      rows,
      summary: { totalRevenue, totalJobs, totalPages, period: `${daysNum} days` },
      statusBreakdown: ['ready', 'done', 'failed', 'refunded', 'expired'].map(status => ({
        status,
        count: db.printJobs.filter(j => j.status === status).length,
        revenue: db.printJobs.filter(j => j.status === status).reduce((s, j) => s + j.cost, 0),
      })),
    }
  });
});

router.get("/admin/reports/kiosks", requireAdmin, (_req, res) => {
  const kiosks = db.stations.map(s => {
    const jobs = db.printJobs.filter(j => (j as any).kioskId === s.id);
    return {
      id: s.id, name: s.name, area: s.area, status: s.status,
      totalJobs: jobs.length,
      totalPages: jobs.reduce((sum, j) => sum + j.pageCount * j.printConfiguration.copies, 0),
      revenue: jobs.reduce((sum, j) => sum + j.cost, 0),
      queue: s.queue,
    };
  });
  res.json({ success: true, data: { kiosks } });
});

// ─── Admin: System Options / Settings ───────────────────────────────────────

const DEFAULT_SETTINGS = [
  { key: 'documentRetentionHours', label: 'Document Retention', value: '24', type: 'number', unit: 'hours', category: 'Storage', description: 'How long files are kept after a job expires. Expired jobs are auto-refunded.', readOnly: false },
  { key: 'maxFileSizeMb', label: 'Max Upload Size', value: '50', type: 'number', unit: 'MB', category: 'Storage', description: 'Maximum single file upload size. Large files slow kiosk release.', readOnly: false },
  { key: 'allowedFileTypes', label: 'Allowed File Types', value: 'PDF, JPG, PNG', type: 'string', unit: '', category: 'Storage', description: 'Comma-separated list of supported formats. Only affects new uploads.', readOnly: false },
  { key: 'jobCodeLength', label: 'Release Code Length', value: '6', type: 'number', unit: 'chars', category: 'Jobs', description: 'Length of the alphanumeric release code printed on receipts.', readOnly: true },
  { key: 'jobExpiryHours', label: 'Job Expiry Window', value: '24', type: 'number', unit: 'hours', category: 'Jobs', description: 'Time before an uncollected print job is marked expired and refunded.', readOnly: false },
  { key: 'maxCopiesPerJob', label: 'Max Copies Per Job', value: '50', type: 'number', unit: 'copies', category: 'Jobs', description: 'Hard cap on number of copies per single print job.', readOnly: false },
  { key: 'walletMinTopUp', label: 'Minimum Top-Up', value: '100', type: 'number', unit: 'NGN', category: 'Payments', description: 'Minimum wallet top-up amount via Paystack.', readOnly: false },
  { key: 'walletMaxBalance', label: 'Maximum Wallet Balance', value: '50000', type: 'number', unit: 'NGN', category: 'Payments', description: 'Cap on wallet balance to reduce fraud exposure.', readOnly: false },
  { key: 'maintenanceMode', label: 'Maintenance Mode', value: 'false', type: 'boolean', unit: '', category: 'System', description: 'When enabled, the user-facing app shows a maintenance banner.', readOnly: false },
  { key: 'appVersion', label: 'App Version', value: '1.0.0', type: 'string', unit: '', category: 'System', description: 'Current deployed version of the application.', readOnly: true },
];

router.get("/admin/options", requireAdmin, (_req, res) => {
  const saved: Record<string, string> = (db as any).systemSettings || {};
  const settings = DEFAULT_SETTINGS.map(s => ({
    ...s,
    value: saved[s.key] !== undefined ? saved[s.key] : s.value,
  }));
  res.json({ success: true, data: { settings } });
});

router.patch("/admin/options/:key", requirePrivilege('manage_settings'), (req: AuthedRequest, res) => {
  const setting = DEFAULT_SETTINGS.find(s => s.key === req.params.key);
  if (!setting) { res.status(404).json({ success: false, message: "Setting not found" }); return; }
  if (setting.readOnly) { res.status(403).json({ success: false, message: "This setting is read-only" }); return; }

  if (!(db as any).systemSettings) (db as any).systemSettings = {};
  (db as any).systemSettings[req.params.key] = String(req.body.value ?? '');
  saveDb();

  res.json({ success: true, data: { ...setting, value: String(req.body.value) } });
});

export default router;

