import { S3Client, CopyObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({ region: process.env.AWS_REGION });

export const handler = async (event: any) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  const record = event.Records?.[0];
  if (!record) {
    throw new Error("No S3 record found in event");
  }

  const bucketName = record.s3.bucket.name;
  const vttKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

  if (!vttKey.endsWith(".vtt")) {
    throw new Error("Uploaded file is not a .vtt subtitle file");
  }

  const baseName = vttKey.replace(".vtt", "");
  const videoKey = `${baseName}.mp4`;

  const sanitizedPrefix = "sanitized/";

  console.log(
    `Preparing sanitized copies: video=${videoKey}, subtitles=${vttKey}`
  );

  // Copy video
  await s3Client.send(
    new CopyObjectCommand({
      Bucket: bucketName,
      CopySource: `${bucketName}/${videoKey}`,
      Key: `${sanitizedPrefix}${baseName}.mp4`,
    })
  );

  // Copy subtitle
  await s3Client.send(
    new CopyObjectCommand({
      Bucket: bucketName,
      CopySource: `${bucketName}/${vttKey}`,
      Key: `${sanitizedPrefix}${baseName}.vtt`,
    })
  );

  console.log("Sanitized video and subtitles copied successfully!");
};
