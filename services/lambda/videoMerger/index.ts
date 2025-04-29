import { S3Client, CopyObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const BUCKET_NAME = process.env.UPLOAD_BUCKET!;

export const handler = async (event: any) => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  const { videoKey, subtitleKey } = event;

  if (!videoKey || !subtitleKey) {
    throw new Error(
      `Missing required keys. videoKey=${videoKey}, subtitleKey=${subtitleKey}`
    );
  }

  const sanitizedPrefix = 'sanitized/';

  const videoBase = videoKey.split('/').pop()?.replace('.mp4', '');
  const subtitleBase = subtitleKey.split('/').pop()?.replace('.vtt', '');

  if (!videoBase || !subtitleBase) {
    throw new Error('Could not parse video or subtitle filenames.');
  }

  const sanitizedVideoKey = `${sanitizedPrefix}${videoBase}.mp4`;
  const sanitizedSubtitleKey = `${sanitizedPrefix}${subtitleBase}.vtt`;

  console.log(`Copying video: ${videoKey} → ${sanitizedVideoKey}`);
  await s3Client.send(
    new CopyObjectCommand({
      Bucket: BUCKET_NAME,
      CopySource: `${BUCKET_NAME}/${videoKey}`,
      Key: sanitizedVideoKey
    })
  );

  console.log(`Copying subtitle: ${subtitleKey} → ${sanitizedSubtitleKey}`);
  await s3Client.send(
    new CopyObjectCommand({
      Bucket: BUCKET_NAME,
      CopySource: `${BUCKET_NAME}/${subtitleKey}`,
      Key: sanitizedSubtitleKey
    })
  );

  console.log('✅ Sanitized video and subtitles copied successfully!');

  return {
    status: 'SUCCESS',
    sanitizedVideoKey,
    sanitizedSubtitleKey
  };
};
