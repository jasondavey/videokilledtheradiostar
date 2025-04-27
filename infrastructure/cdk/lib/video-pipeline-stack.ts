import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as path from "path";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";

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

    const startTranscribeLambda = new lambda.Function(
      this,
      "StartTranscribeLambda",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: "index.handler",
        code: lambda.Code.fromAsset(
          path.resolve(__dirname, "../../../services/lambda/transcribeStart")
        ),
        environment: {
          UPLOAD_BUCKET: uploadBucket.bucketName,
        },
      }
    );

    const checkTranscribeStatusLambda = new lambda.Function(
      this,
      "CheckTranscribeStatusLambda",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: "index.handler",
        code: lambda.Code.fromAsset(
          path.resolve(
            __dirname,
            "../../../services/lambda/transcribeStatusCheck"
          )
        ),
        environment: {
          UPLOAD_BUCKET: uploadBucket.bucketName,
        },
      }
    );

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

    startTranscribeLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["transcribe:StartTranscriptionJob"],
        resources: ["*"],
      })
    );

    checkTranscribeStatusLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["transcribe:GetTranscriptionJob"],
        resources: ["*"],
      })
    );

    // 🔔 6. Notifications and Event Wiring
    uploadBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SqsDestination(videoQueue)
    );

    const startJob = new tasks.LambdaInvoke(this, "Start Transcribe Job", {
      lambdaFunction: startTranscribeLambda,
      outputPath: "$.Payload",
    });

    const waitX = new sfn.Wait(this, "Wait 1 Minute", {
      time: sfn.WaitTime.duration(cdk.Duration.minutes(1)),
    });

    const checkJob = new tasks.LambdaInvoke(
      this,
      "Check Transcribe Job Status",
      {
        lambdaFunction: checkTranscribeStatusLambda,
        outputPath: "$.Payload",
      }
    );

    const jobSucceeded = new sfn.Choice(this, "Job Complete?");

    const definition = startJob
      .next(waitX)
      .next(checkJob)
      .next(
        jobSucceeded
          .when(sfn.Condition.stringEquals("$.status", "IN_PROGRESS"), waitX)
          .when(
            sfn.Condition.stringEquals("$.status", "FAILED"),
            new sfn.Fail(this, "Transcribe Failed")
          )
          .when(
            sfn.Condition.stringEquals("$.status", "COMPLETED"),
            new sfn.Succeed(this, "Transcribe Completed")
          )
      );

    const stateMachine = new sfn.StateMachine(
      this,
      "VideoProcessingStateMachine",
      {
        definition,
        timeout: cdk.Duration.minutes(30),
      }
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
