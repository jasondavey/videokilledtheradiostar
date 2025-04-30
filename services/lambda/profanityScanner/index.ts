import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { logAndReturn } from '../../utils/logReturn';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.UPLOAD_BUCKET!;
const PROFANITY_LIST = ['damn', 'hell', 'duck', 'trumpet'];

const streamToString = async (stream: Readable): Promise<string> => {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    stream.on('error', reject);
  });
};

export const handler = async (event: any) => {
  const transcriptKey = event.transcriptKey;
  const videoKey = event.videoKey;

  console.log('[ProfanityScanner] Received event:', JSON.stringify(event));
  console.log(
    `Scanning transcriptKey: ${transcriptKey}, videoKey: ${videoKey}`
  );

  if (!transcriptKey || !videoKey) {
    throw new Error('Missing transcriptKey or videoKey');
  }

  try {
    // Check if transcript file exists
    const head = await s3.send(
      new HeadObjectCommand({ Bucket: BUCKET, Key: transcriptKey })
    );
    console.log(
      `[ProfanityScanner] Transcript exists. Size: ${head.ContentLength}`
    );

    // Proceed to read the file
    const response = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: transcriptKey })
    );

    const body = await streamToString(response.Body as Readable);
    const transcript = JSON.parse(body);

    const items = transcript.results.items;

    const censorSegments = items
      .filter((item: any) => item.type === 'pronunciation')
      .filter((item: any) => {
        const word = item.alternatives[0].content.toLowerCase();
        return PROFANITY_LIST.includes(word);
      })
      .map((item: any) => ({
        word: item.alternatives[0].content,
        start: item.start_time,
        end: item.end_time
      }));

    console.log('[ProfanityScanner] Found profanity:', censorSegments);

    return logAndReturn({
      status: 'SUCCESS',
      videoKey,
      transcriptKey,
      profanityTimestamps: censorSegments
    });
  } catch (error) {
    console.error('Error scanning transcript:', error);
    return logAndReturn({
      status: 'FAILED',
      error: (error as Error).message
    });
  }
};
