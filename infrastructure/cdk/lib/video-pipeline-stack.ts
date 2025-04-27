import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

export class VideoPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. Upload bucket
    const uploadBucket = new s3.Bucket(this, "UploadBucket", {
      bucketName: "video-sanitizer-uploads",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // 2. SQS queue
    const videoQueue = new sqs.Queue(this, "VideoProcessingQueue", {
      visibilityTimeout: cdk.Duration.minutes(15),
    });

    // 3. Lambda function (placeholder)
    const processorFn = new lambda.Function(this, "VideoProcessorFunction", {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "index.handler",
      code: lambda.Code.fromInline(`
        exports.handler = async function(event) {
          console.log("Processing video", JSON.stringify(event));
          return {};
        }
      `),
      environment: {
        QUEUE_URL: videoQueue.queueUrl,
      },
    });

    // Grant Lambda permissions
    videoQueue.grantSendMessages(processorFn);
    uploadBucket.grantRead(processorFn);

    // 4. S3 Event -> SQS
    uploadBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SqsDestination(videoQueue)
    );
  }
}
