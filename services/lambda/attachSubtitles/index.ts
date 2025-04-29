import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand
} from '@aws-sdk/client-s3';
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.UPLOAD_BUCKET!;
const ffmpegPath = '/opt/ffmpeg/ffmpeg';

const streamToFile = async (stream: Readable, path: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const file = require('fs').createWriteStream(path);
    stream.pipe(file);
    file.on('finish', resolve);
    file.on('error', reject);
  });
};

const runFfmpeg = (
  ffmpegPath: string,
  videoPath: string,
  vttPath: string,
  outputPath: string
): Promise<void> => {
  return new Promise((resolve, reject) => {
    console.log(`Running ffmpeg from ${ffmpegPath}`);
    console.time('⏱️ ffmpeg duration');

    const ffmpeg = spawn(ffmpegPath, [
      '-i',
      videoPath,
      '-vf',
      `subtitles=${vttPath}`,
      '-c:a',
      'copy',
      outputPath
    ]);

    ffmpeg.stderr.on('data', (data) => console.log(data.toString()));

    ffmpeg.on('close', (code) => {
      console.timeEnd('⏱️ ffmpeg duration'); // ✅ log timing
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
};

export const handler = async (event: any) => {
  console.log('Received event:', JSON.stringify(event));

  const { videoKey, subtitleKey } = event;

  console.log('videoKey:', videoKey);
  console.log('subtitleKey:', subtitleKey);

  if (!videoKey || !subtitleKey) {
    throw new Error(
      `Missing required keys. videoKey=${videoKey}, subtitleKey=${subtitleKey}`
    );
  }
  const outputKey = videoKey
    .replace(/^uploads\//, 'sanitized/')
    .replace(/\.mp4$/, '-subtitled.mp4');

  const videoPath = join(tmpdir(), 'input.mp4');
  const vttPath = join(tmpdir(), 'subtitles.vtt');
  const outputPath = join(tmpdir(), 'output.mp4');

  try {
    console.log(`Downloading video: ${videoKey}`);
    const videoObj = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: videoKey })
    );
    await streamToFile(videoObj.Body as Readable, videoPath);

    console.log(`Downloading subtitles: ${subtitleKey}`);
    const vttObj = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: subtitleKey })
    );
    await streamToFile(vttObj.Body as Readable, vttPath);

    console.log('Running ffmpeg to attach subtitles...');
    await runFfmpeg(ffmpegPath, videoPath, vttPath, outputPath);

    console.log(`Uploading result to: ${outputKey}`);
    const finalBuffer = readFileSync(outputPath);

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: outputKey,
        Body: finalBuffer,
        ContentType: 'video/mp4'
      })
    );

    return {
      status: 'SUCCESS',
      outputKey,
      videoKey,
      subtitleKey
    };
  } catch (error) {
    console.error('❌ Failed to attach subtitles', error);
    return {
      status: 'FAILED',
      error: (error as Error).message
    };
  }
};
