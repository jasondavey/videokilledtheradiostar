import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { logAndReturn } from '../../utils/logReturn';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.UPLOAD_BUCKET!;

const streamToString = async (stream: Readable): Promise<string> => {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    stream.on('error', reject);
  });
};

export const handler = async (event: any) => {
  console.log('[Subtitle Transformer] Received event:', JSON.stringify(event));
  const { subtitleKey, profanityTimestamps } = event;

  if (!subtitleKey || !profanityTimestamps) {
    throw new Error('Missing subtitleKey or profanityTimestamps');
  }

  const response = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: subtitleKey })
  );

  const originalVtt = await streamToString(response.Body as Readable);

  // === Transform ===
  const lines = originalVtt.split('\n');
  const censoredLines = lines.map((line) => {
    for (const segment of profanityTimestamps) {
      const word = segment.word;
      const regex = new RegExp(`\\b${word}\\b`, 'gi'); // word boundary
      line = line.replace(regex, '****');
    }
    return line;
  });

  const updatedVtt = censoredLines.join('\n');

  const censoredKey = subtitleKey.replace('.vtt', '.censored.vtt');
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: censoredKey,
      Body: updatedVtt,
      ContentType: 'text/vtt'
    })
  );

  console.log(`✅ Censored subtitles uploaded to ${censoredKey}`);

  return logAndReturn({
    status: 'SUCCESS',
    subtitleKey: censoredKey
  });
};
