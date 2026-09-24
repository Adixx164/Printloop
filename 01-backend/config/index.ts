import dotenv from 'dotenv';
dotenv.config();

export const config = {
  app: {
    env: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || '2.0.0',
    port: parseInt(process.env.PORT || '4000', 10),
    allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map(s => s.trim()),
  },

  database: {
    url: process.env.DATABASE_URL || '',
    file: process.env.DATABASE_FILE || './data/printloop.sqlite',
    ssl: process.env.DB_SSL === 'true',
    poolMax: parseInt(process.env.DB_POOL_MAX || '10', 10),
    logging: process.env.DB_LOGGING === 'true',
  },

  redis: {
    url: process.env.REDIS_URL || '',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
    enabled: process.env.DISABLE_REDIS !== '1' && Boolean(process.env.REDIS_URL || process.env.REDIS_HOST),
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  saas: {
    commissionPctDefault: parseFloat(process.env.COMMISSION_PCT_DEFAULT || '0.10'),
    apexDomains: (process.env.PRINTLOOP_APEX_DOMAINS || 'printloop.app,printloop.test,localhost').split(',').map(s => s.trim()),
    domainsCname: process.env.PRINTLOOP_DOMAINS_CNAME || 'domains.printloop.app',
    seedDemo: process.env.SEED_DEMO === '1',
    renderCallbackSecret: process.env.RENDER_CALLBACK_SECRET || '',
  },

  payments: {
    paystack: {
      publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
      secretKey: process.env.PAYSTACK_SECRET_KEY || '',
      webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET || '',
    },
    commissionPctDefault: parseFloat(process.env.COMMISSION_PCT_DEFAULT || '0.10'),
  },

  storage: {
    s3: {
      bucket: process.env.S3_BUCKET || 'printloop-uploads',
      region: process.env.AWS_REGION || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    },
    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
      apiKey: process.env.CLOUDINARY_API_KEY || '',
      apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    },
  },

  email: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || 'PrintLoop <noreply@printloop.app>',
  },

  sms: {
    termii: {
      apiKey: process.env.TERMII_API_KEY || '',
      senderId: process.env.TERMII_SENDER_ID || 'PrintLoop',
    },
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    pretty: process.env.LOG_PRETTY === 'true' || process.env.NODE_ENV !== 'production',
  },

  sentry: {
    dsn: process.env.SENTRY_DSN || '',
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0'),
  },

  render: {
    callbackSecret: process.env.RENDER_CALLBACK_SECRET || '',
    callbackUrl: process.env.RENDER_CALLBACK_URL || 'http://localhost:4000/api/internal/render/callback',
  },

  office: {
    converter: process.env.DOC_CONVERTER || 'gotenberg',
    gotenbergUrl: process.env.GOTENBERG_URL || 'http://localhost:3000',
  },

  print: {
    dispatchMode: process.env.PRINT_DISPATCH_MODE || 'cloud-push',
  },

  editor: {
    libreofficeUrl: process.env.LIBREOFFICE_URL || 'http://localhost:9980',
    univerLibreOfficeUrl: process.env.LIBREOFFICE_UNO_URL || 'socket,host=libreoffice,port=2002;urp;StarOffice.ComponentContext',
    univerExportUrl: process.env.UNIVER_EXPORT_URL || 'http://localhost:3001/export',
    coturnPassword: process.env.COTURN_PASSWORD || 'changeme',
    turnServer: process.env.TURN_SERVER || '',
    turnTlsServer: process.env.TURN_TLS_SERVER || '',
    sessionTtlHours: parseInt(process.env.EDITOR_SESSION_TTL_HOURS || '24', 10),
    snapshotIntervalMs: parseInt(process.env.EDITOR_SNAPSHOT_INTERVAL_MS || '30000', 10),
  },

  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
};