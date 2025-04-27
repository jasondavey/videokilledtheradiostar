import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as path from "path";

export class VideoPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 🛢️ 1. S3 Buckets
    const uploadBucket = new s3.Bucket(this, "UploadBucket", {
      bucketName: "video-sanitizer-uploads",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // 📬 2. SQS Queue
    const videoQueue = new sqs.Queue(this, "VideoProcessingQueue", {
      visibilityTimeout: cdk.Duration.minutes(15),
    });

    // 🗂️ 3. DynamoDB Table
    const videoMetadataTable = new dynamodb.Table(this, "VideoMetadataTable", {
      tableName: "VideoMetadata",
      partitionKey: { name: "videoId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // 🚀 4. Lambda Function
    const processorFn = new lambda.Function(this, "VideoProcessorFunction", {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "processor.handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../../../services/lambda")
      ),
      environment: {
        QUEUE_URL: videoQueue.queueUrl,
        METADATA_TABLE: videoMetadataTable.tableName,
        UPLOAD_BUCKET: uploadBucket.bucketName,
      },
    });

    // 🔒 5. Grant Permissions
    videoQueue.grantSendMessages(processorFn);
    uploadBucket.grantReadWrite(processorFn);
    videoMetadataTable.grantWriteData(processorFn);

    processorFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "transcribe:StartTranscriptionJob",
          "transcribe:GetTranscriptionJob",
        ],
        resources: ["*"],
      })
    );

    // 🔔 6. Notifications and Event Wiring
    uploadBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SqsDestination(videoQueue)
    );

    // 📤 7. Outputs
    new cdk.CfnOutput(this, "VideoMetadataTableName", {
      value: videoMetadataTable.tableName,
      description: "The name of the DynamoDB Video Metadata table",
    });

    new cdk.CfnOutput(this, "UploadBucketName", {
      value: uploadBucket.bucketName,
      description: "The name of the video upload bucket",
    });
  }
}
