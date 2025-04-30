import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand
} from '@aws-sdk/client-s3';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFileSync, createWriteStream } from 'fs';
import { Readable } from 'stream';
import { logAndReturn } from '../../utils/logReturn';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.UPLOAD_BUCKET!;
const FFMPEG = '/opt/ffmpeg/ffmpeg';

const streamToFile = async (stream: Readable, path: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(path);
    stream.pipe(file);
    file.on('finish', resolve);
    file.on('error', reject);
  });
};

export const handler = async (event: any) => {
  console.log('[Audio Censor] Received event:', JSON.stringify(event));

  const { videoKey, profanityTimestamps, transcriptKey } = event;

  validateRequiredFields({
    videoKey,
    transcriptKey,
    profanityTimestamps
  });

  const inputPath = join(tmpdir(), 'input.mp4');
  const outputPath = join(tmpdir(), 'censored.mp4');
  const censoredKey = videoKey
    .replace(/^uploads\//, 'censored/')
    .replace(/\.mp4$/, '-censored.mp4');

  try {
    console.log(`Downloading video from: ${videoKey}`);
    const object = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: videoKey })
    );
    await streamToFile(object.Body as Readable, inputPath);

    const volumeFilters = profanityTimestamps
      .map(
        ({ start, end }: any, i: number) =>
          `[0:a]volume=enable='between(t,${start},${end})':volume=0[a${i}]`
      )
      .join(';');

    const amixInputs = profanityTimestamps
      .map((_: any, i: number) => `[a${i}]`)
      .join('');

    const filterComplex = `${volumeFilters};${amixInputs}amix=inputs=${profanityTimestamps.length}[aout]`;

    const ffmpeg = spawn(FFMPEG, [
      '-i',
      inputPath,
      '-filter_complex',
      filterComplex,
      '-map',
      '0:v',
      '-map',
      '[aout]',
      '-c:v',
      'copy',
      '-y',
      outputPath
    ]);

    ffmpeg.stderr.on('data', (d) => console.log(d.toString()));
    await new Promise((res, rej) =>
      ffmpeg.on('close', (code) =>
        code === 0
          ? res(null)
          : rej(new Error(`ffmpeg exited with code ${code}`))
      )
    );

    console.log(`Uploading to: ${censoredKey}`);
    const buffer = readFileSync(outputPath);

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: censoredKey,
        Body: buffer,
        ContentType: 'video/mp4'
      })
    );

    return logAndReturn({
      status: 'SUCCESS',
      videoKey,
      transcriptKey,
      outputKey: censoredKey
    });
  } catch (error) {
    console.error('Audio censorship failed:', error);
    return {
      status: 'FAILED',
      error: (error as Error).message
    };
  }
};

function validateRequiredFields(fields: Record<string, any>) {
  const missing = Object.entries(fields)
    .filter(
      ([_, value]) =>
        value === undefined ||
        value === null ||
        (Array.isArray(value) && value.length === 0)
    )
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
}
