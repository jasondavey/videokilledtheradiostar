import { StepFunctions } from "aws-sdk";

const stepFunctions = new StepFunctions();
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN!;

export const handler = async (event: any) => {
  console.log("Received S3 event:", JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    const s3Info = record.s3;
    const objectKey = decodeURIComponent(s3Info.object.key.replace(/\+/g, " "));
    const videoId =
      objectKey.split("/").pop()?.split(".")[0] ?? `video-${Date.now()}`;

    const input = {
      videoId,
      objectKey,
    };

    await stepFunctions
      .startExecution({
        stateMachineArn: STATE_MACHINE_ARN,
        input: JSON.stringify(input),
      })
      .promise();

    console.log(`Started Step Function execution for ${videoId}`);
  }
};
