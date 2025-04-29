import {
  S3Client,
  CopyObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.UPLOAD_BUCKET!;

export const handler = async (event: any) => {
  console.log("Moving transcript for:", event);

  const { objectKey } = event;
  if (!objectKey) {
    throw new Error("Missing objectKey in event!");
  }

  const targetKey = `transcripts/${objectKey}`;

  // Copy the object
  await s3Client.send(
    new CopyObjectCommand({
      Bucket: BUCKET,
      CopySource: `${BUCKET}/${objectKey}`,
      Key: targetKey,
    })
  );

  // Delete the original
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: objectKey,
    })
  );

  console.log(`Moved ${objectKey} ➔ ${targetKey}`);

  return {
    transcriptKey: targetKey,
  };
};
