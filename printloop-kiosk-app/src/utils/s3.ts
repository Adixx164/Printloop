import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config';

let s3Client: S3Client | null = null;

function getClient(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: config.s3.region,
      endpoint: config.s3.endpoint,
      credentials: {
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey,
      },
      forcePathStyle: config.s3.forcePathStyle,
    });
  }
  return s3Client;
}

export async function downloadFromS3(key: string): Promise<Buffer> {
  const client = getClient();
  const command = new GetObjectCommand({ Bucket: config.s3.bucket, Key: key });
  const response = await client.send(command);
  
  if (!response.Body) throw new Error(`S3 object ${key} has no body`);
  
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}