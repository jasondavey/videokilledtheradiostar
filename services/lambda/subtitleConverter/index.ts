import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { filterProfanity } from '../../utils/profanityFilter';
import { logAndReturn } from '../../utils/logReturn';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET_NAME = process.env.UPLOAD_BUCKET!;

const streamToString = async (stream: Readable): Promise<string> => {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    stream.on('error', reject);
  });
};

function convertToWebVTT(items: any[]): string {
  let vtt = 'WEBVTT\n\n';
  let index = 1;

  for (const item of items) {
    if (item.type !== 'pronunciation') continue;

    const start = parseFloat(item.start_time).toFixed(3);
    const end = parseFloat(item.end_time).toFixed(3);
    const text = filterProfanity(item.alternatives[0].content);

    vtt += `${index++}\n`;
    vtt += `${formatTimestamp(start)} --> ${formatTimestamp(end)}\n`;
    vtt += `${text}\n\n`;
  }

  return vtt;
}

function formatTimestamp(seconds: string): string {
  const [whole, fractional = '000'] = seconds.split('.');
  const sec = parseInt(whole, 10);
  const hrs = String(Math.floor(sec / 3600)).padStart(2, '0');
  const min = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const secPart = String(sec % 60).padStart(2, '0');
  const ms = fractional.padEnd(3, '0');
  return `${hrs}:${min}:${secPart}.${ms}`;
}

export const handler = async (event: any) => {
  console.log('[Subtitle Converter] Received event:', JSON.stringify(event));

  const transcriptKey = event.transcriptKey;
  const videoKey = event.videoKey;

  if (!transcriptKey || !videoKey) {
    throw new Error(
      `Missing required fields: transcriptKey=${transcriptKey}, videoKey=${videoKey}`
    );
  }

  try {
    console.log(`Converting transcript: ${transcriptKey}`);

    const getCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: transcriptKey
    });

    const response = await s3.send(getCommand);
    const body = await streamToString(response.Body as Readable);
    const transcriptJson = JSON.parse(body);

    const items = Array.isArray(transcriptJson?.results?.items)
      ? transcriptJson.results.items
      : [];

    if (!items.length) {
      throw new Error('Transcript file contains no items to convert.');
    }

    const vtt = convertToWebVTT(items);

    const vttKey = transcriptKey
      .replace(/^transcripts\//, 'subtitles/')
      .replace(/\.json$/, '.vtt');

    const putCommand = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: vttKey,
      Body: vtt,
      ContentType: 'text/vtt'
    });

    await s3.send(putCommand);

    console.log(`✅ Uploaded subtitles to ${vttKey}`);

    return logAndReturn({
      status: 'SUCCESS',
      subtitleKey: vttKey,
      videoKey
    });
  } catch (error) {
    console.error('❌ Failed to convert transcript to subtitles', error);
    return logAndReturn({
      status: 'FAILED',
      error: (error as Error).message,
      videoKey
    });
  }
};
