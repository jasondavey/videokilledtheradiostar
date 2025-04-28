import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";
import { format } from "date-fns";

const s3Client = new S3Client({ region: process.env.AWS_REGION });

const BAD_WORDS = ["badword1", "badword2", "duck", "anotherbadword"];

export const handler = async (event: any) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  const record = event.Records?.[0];
  if (!record) {
    throw new Error("No S3 record found in event");
  }

  const bucketName = record.s3.bucket.name;
  const objectKey = decodeURIComponent(
    record.s3.object.key.replace(/\+/g, " ")
  );

  console.log(
    `Downloading transcription file from s3://${bucketName}/${objectKey}`
  );

  const objectResponse = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    })
  );

  const bodyContents = await streamToString(objectResponse.Body as Readable);

  const transcriptionData = JSON.parse(bodyContents);

  const items = transcriptionData.results?.items || [];

  console.log(`Found ${items.length} transcript items`);

  // Build WebVTT content
  let vttContent = "WEBVTT\n\n";
  let subtitleIndex = 1;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    if (item.type === "pronunciation") {
      const startTime = parseFloat(item.start_time);
      const endTime = parseFloat(item.end_time);
      let content = item.alternatives?.[0]?.content || "";

      // Replace bad words
      if (BAD_WORDS.includes(content.toLowerCase())) {
        content = "[bleep]";
      }

      const startTimestamp = secondsToTimestamp(startTime);
      const endTimestamp = secondsToTimestamp(endTime);

      vttContent += `${subtitleIndex}\n`;
      vttContent += `${startTimestamp} --> ${endTimestamp}\n`;
      vttContent += `${content}\n\n`;

      subtitleIndex++;
    }
  }

  console.log("Generated WebVTT content:\n", vttContent);

  const subtitleKey = objectKey.replace(".json", ".vtt");

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: subtitleKey,
      Body: vttContent,
      ContentType: "text/vtt",
    })
  );

  console.log(
    `Uploaded clean subtitle file to s3://${bucketName}/${subtitleKey}`
  );
};

const streamToString = async (stream: Readable): Promise<string> => {
  const chunks: any[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
};

const secondsToTimestamp = (seconds: number): string => {
  const date = new Date(seconds * 1000);
  return format(date, "HH:mm:ss.SSS");
};
