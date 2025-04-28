import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";

const sfnClient = new SFNClient({ region: process.env.AWS_REGION });
const stateMachineArn = process.env.STATE_MACHINE_ARN!;

export const handler = async (event: any) => {
  console.log("Received event from S3 upload:", JSON.stringify(event, null, 2));

  const s3Info = event.Records?.[0]?.s3;
  if (!s3Info) {
    throw new Error("No S3 info found in event");
  }

  const objectKey = decodeURIComponent(s3Info.object.key.replace(/\+/g, " "));

  console.log(`Starting state machine execution for file: ${objectKey}`);

  await sfnClient.send(
    new StartExecutionCommand({
      stateMachineArn,
      input: JSON.stringify({ objectKey }), // Pass the objectKey to the Step Function
    })
  );

  console.log("Successfully started Step Function execution");

  return { status: "started" };
};
