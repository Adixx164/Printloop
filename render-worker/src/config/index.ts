import dotenv from 'dotenv';
dotenv.config();

export const config = {
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  bullmq: {
    queueName: 'render',
    concurrency: parseInt(process.env.RENDER_CONCURRENCY || '2', 10),
  },
  s3: {
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || undefined,
    bucket: process.env.S3_BUCKET || 'printloop-renders',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  },
  render: {
    defaultDpi: parseInt(process.env.RENDER_DEFAULT_DPI || '300', 10),
    maxDpi: parseInt(process.env.RENDER_MAX_DPI || '600', 10),
    tempDir: process.env.RENDER_TEMP_DIR || '/tmp/printloop-render',
  },
  callback: {
    url: process.env.RENDER_CALLBACK_URL || 'http://localhost:4000/api/internal/render/callback',
    secret: process.env.RENDER_CALLBACK_SECRET || '',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    pretty: process.env.NODE_ENV !== 'production',
  },
};