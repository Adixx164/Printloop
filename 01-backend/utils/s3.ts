import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';

export const s3Client = new S3Client({
  region: config.storage.s3.region,
  endpoint: config.storage.s3.endpoint,
  credentials: {
    accessKeyId: config.storage.s3.accessKeyId,
    secretAccessKey: config.storage.s3.secretAccessKey,
  },
  forcePathStyle: config.storage.s3.forcePathStyle,
});

export async function downloadFromS3(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({ Bucket: config.storage.s3.bucket, Key: key });
  const response = await s3Client.send(command);
  if (!response.Body) throw new Error(`S3 object ${key} has no body`);
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function uploadToS3(key: string, body: Buffer, contentType: string): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: config.storage.s3.bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await s3Client.send(command);
}

export async function deleteFromS3(key: string): Promise<void> {
  const command = new DeleteObjectCommand({ Bucket: config.storage.s3.bucket, Key: key });
  await s3Client.send(command);
}

export async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({ Bucket: config.storage.s3.bucket, Key: key });
  return getSignedUrl(s3Client, command, { expiresIn });
}

export function generatePreflightKey(printJobId: string, suffix: string = 'preflight'): string {
  return `preflight/${printJobId}/${Date.now()}.${suffix}`;
}