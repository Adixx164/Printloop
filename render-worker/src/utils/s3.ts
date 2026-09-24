import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';
import { logger } from './logger';
import * as fs from 'fs/promises';
import * as path from 'path';

export const s3Client = new S3Client({
  region: config.s3.region,
  endpoint: config.s3.endpoint,
  credentials: {
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
  },
  forcePathStyle: config.s3.forcePathStyle,
});

export async function downloadFromS3(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({ Bucket: config.s3.bucket, Key: key });
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
    Bucket: config.s3.bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await s3Client.send(command);
}

export async function deleteFromS3(key: string): Promise<void> {
  const command = new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: key });
  await s3Client.send(command);
}

export async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({ Bucket: config.s3.bucket, Key: key });
  return getSignedUrl(s3Client, command, { expiresIn });
}

export function generateRenderKey(printJobId: string, suffix: string = 'pwg'): string {
  return `renders/${printJobId}/${Date.now()}.${suffix}`;
}

export async function writeTempFile(buffer: Buffer, extension: string): Promise<string> {
  await fs.mkdir(config.render.tempDir, { recursive: true });
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const filePath = path.join(config.render.tempDir, fileName);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

export async function readTempFile(filePath: string): Promise<Buffer> {
  return fs.readFile(filePath);
}

export async function deleteTempFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch {
    // ignore
  }
}