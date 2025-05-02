import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { createWriteStream, readFileSync } from 'fs';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.UPLOAD_BUCKET!;
const ffmpegPath = '/opt/ffmpeg/ffmpeg';

const streamToFile = async (stream: Readable, path: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(path);
    stream.pipe(file);
    file.on('finish', resolve);
    file.on('error', reject);
  });
};

const runFfmpeg = (ffmpegArgs: string[], workingDir: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    console.log(`[FFmpeg] Running: ${ffmpegPath} ${ffmpegArgs.join(' ')}`);
    const ffmpeg = spawn(ffmpegPath, ffmpegArgs, { cwd: workingDir });

    ffmpeg.stderr.on('data', (data) =>
      console.error(`[FFmpeg] ${data.toString()}`)
    );
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
};

export const handler = async (event: any) => {
  console.log('[Audio Censor] Received event:', JSON.stringify(event, null, 2));

  const { videoKey, transcriptKey, profanityTimestamps } = event;
  if (!videoKey || !transcriptKey || !profanityTimestamps?.length) {
    throw new Error(
      'Missing required fields: ' +
        [
          !videoKey ? 'videoKey' : '',
          !transcriptKey ? 'transcriptKey' : '',
          !profanityTimestamps?.length ? 'profanityTimestamps' : ''
        ]
          .filter(Boolean)
          .join(', ')
    );
  }

  const workDir = tmpdir();
  const videoPath = join(workDir, 'input.mp4');
  const outputPath = join(workDir, 'censored.mp4');

  const videoObj = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: videoKey })
  );
  await streamToFile(videoObj.Body as Readable, videoPath);

  const filterComplex = generateBeepOverlayFilter(profanityTimestamps);

  const ffmpegArgs = [
    '-i',
    videoPath,
    '-filter_complex',
    filterComplex,
    '-map',
    '0:v',
    '-map',
    '[mixed]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-shortest',
    outputPath
  ];

  try {
    await runFfmpeg(ffmpegArgs, workDir);

    const outputKey = videoKey
      .replace(/^uploads\//, 'censored/')
      .replace(/\.mp4$/, '-censored.mp4');

    const finalBuffer = readFileSync(outputPath);

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: outputKey,
        Body: finalBuffer,
        ContentType: 'video/mp4'
      })
    );

    console.log(`✅ Uploaded censored video to: ${outputKey}`);

    return {
      status: 'SUCCESS',
      outputKey,
      videoKey,
      transcriptKey
    };
  } catch (error) {
    console.error('❌ Failed to censor audio', error);
    return {
      status: 'FAILED',
      error: (error as Error).message
    };
  }
};

export function generateBeepOverlayFilter(
  segments: { start: string; end: string }[]
): string {
  if (!segments.length) throw new Error('No profanity segments provided');

  const prePostPadding = 0.1; // 100ms buffer on either side for cleaner cuts
  const beepFreq = 1000;
  const sampleRate = 44100;

  // Construct mute logic and beep overlay filters
  const muteConditions = segments
    .map((seg) => {
      const start = (parseFloat(seg.start) - prePostPadding).toFixed(3);
      const end = (parseFloat(seg.end) + prePostPadding).toFixed(3);
      return `between(t,${start},${end})`;
    })
    .join('+');

  const filters: string[] = [];

  // Step 1: Apply conditional volume to mute segments
  filters.push(`[0:a]volume='if(${muteConditions},0,1)'[a0]`);

  // Step 2: For each segment, generate beep sine, delay, and pad
  segments.forEach((seg, i) => {
    const start = Math.max(0, parseFloat(seg.start) - prePostPadding);
    const end = parseFloat(seg.end) + prePostPadding;
    const duration = (end - start).toFixed(3);
    const delayMs = Math.floor(start * 1000);

    filters.push(
      `sine=frequency=${beepFreq}:duration=${duration}:sample_rate=${sampleRate}[s${i}]`,
      `[s${i}]adelay=${delayMs}|${delayMs},apad[b${i}]`
    );
  });

  // Step 3: Mix muted audio and all beeps
  const amixInputs = ['[a0]', ...segments.map((_, i) => `[b${i}]`)].join('');
  const mix = `${amixInputs}amix=inputs=${
    segments.length + 1
  }:duration=longest:dropout_transition=0[mixed]`;
  filters.push(mix);

  return filters.join('; ');
}
