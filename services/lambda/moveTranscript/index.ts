import { S3Client, CopyObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: process.env.AWS_REGION });

const UPLOAD_BUCKET = process.env.UPLOAD_BUCKET!;

export const handler = async (event: any) => {
  console.log('MoveTranscript Lambda triggered with:', event);

  const { transcriptKey } = event;

  if (!transcriptKey) {
    throw new Error('Missing transcriptKey in event input');
  }

  const destinationKey = transcriptKey.replace(/^transcripts\//, 'sanitized/');

  console.log(`Copying from ${transcriptKey} to ${destinationKey}`);

  // Copy the transcript JSON to sanitized/ folder
  await s3.send(
    new CopyObjectCommand({
      Bucket: UPLOAD_BUCKET,
      CopySource: `${UPLOAD_BUCKET}/${transcriptKey}`, // full path needed
      Key: destinationKey
    })
  );

  console.log(`Copied transcript successfully.`);

  // Optional: delete the original transcript
  // await s3.send(
  //   new DeleteObjectCommand({
  //     Bucket: UPLOAD_BUCKET,
  //     Key: transcriptKey
  //   })
  // );

  //console.log(`Deleted original transcript.`);

  return {
    destinationKey
  };
};
