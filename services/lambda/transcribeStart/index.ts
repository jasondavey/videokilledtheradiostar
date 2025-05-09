import {
  TranscribeClient,
  StartTranscriptionJobCommand
} from '@aws-sdk/client-transcribe';
import { logAndReturn } from '../../utils/logReturn';

const UPLOAD_BUCKET = process.env.UPLOAD_BUCKET!;
const AWS_REGION = process.env.AWS_REGION!;

const transcribeClient = new TranscribeClient({
  region: AWS_REGION
});

export const handler = async (event: any) => {
  console.log('[Transcribe Start] Received event:', JSON.stringify(event));

  let objectKey: string | undefined;

  if (event.Records && event.Records[0]?.s3?.object?.key) {
    objectKey = decodeURIComponent(
      event.Records[0].s3.object.key.replace(/\+/g, ' ')
    );
  } else if (event.objectKey) {
    objectKey = event.objectKey;
  }

  if (!objectKey) {
    throw new Error('S3 object key not found in event');
  }

  const objectKeyParts = objectKey.split('/');
  const fileName = objectKeyParts[objectKeyParts.length - 1];
  const baseName = fileName.split('.')[0];
  const videoId = baseName;
  const transcribeJobName = `transcribe-${baseName}-${Date.now()}`;

  const mediaFileUri = `https://${UPLOAD_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${objectKey}`;

  console.log(`Starting transcription job for ${mediaFileUri}`);

  await transcribeClient.send(
    new StartTranscriptionJobCommand({
      TranscriptionJobName: transcribeJobName,
      LanguageCode: 'en-US',
      MediaFormat: 'mp4',
      Media: {
        MediaFileUri: mediaFileUri
      },
      OutputBucketName: UPLOAD_BUCKET,
      OutputKey: 'transcripts/',
      Settings: {
        ShowSpeakerLabels: false,
        ChannelIdentification: false
      }
    })
  );

  console.log('Successfully started transcription job:', transcribeJobName);

  return logAndReturn({
    transcribeJobName,
    videoId,
    videoKey: objectKey
  });
};
