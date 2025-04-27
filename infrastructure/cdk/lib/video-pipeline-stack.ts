import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
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

    // 🗂️ 3. DynamoDB Table
    const videoMetadataTable = new dynamodb.Table(this, "VideoMetadataTable", {
      tableName: "VideoMetadata",
      partitionKey: { name: "videoId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const transcribeStartLambda = new lambda.Function(
      this,
      "startTranscribeLambda",
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

    const transcribeStatusCheckLambda = new lambda.Function(
      this,
      "transcribeStatusCheckLambda",
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

    //Grant Permissions
    transcribeStartLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["transcribe:StartTranscriptionJob"],
        resources: ["*"],
      })
    );

    transcribeStatusCheckLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["transcribe:GetTranscriptionJob"],
        resources: ["*"],
      })
    );

    const startJob = new tasks.LambdaInvoke(this, "Start Transcribe Job", {
      lambdaFunction: transcribeStartLambda,
      outputPath: "$.Payload",
    });

    const waitX = new sfn.Wait(this, "Wait 1 Minute", {
      time: sfn.WaitTime.duration(cdk.Duration.minutes(1)),
    });

    const checkJob = new tasks.LambdaInvoke(
      this,
      "Check Transcribe Job Status",
      {
        lambdaFunction: transcribeStatusCheckLambda,
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

    const UploadedVideoTriggerLambda = new lambda.Function(
      this,
      "UploadedVideoTrigger",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: "index.handler",
        code: lambda.Code.fromAsset(
          path.resolve(
            __dirname,
            "../../../services/lambda/uploadedVideoTrigger"
          )
        ),
        environment: {
          STATE_MACHINE_ARN: stateMachine.stateMachineArn,
        },
      }
    );

    stateMachine.grantStartExecution(UploadedVideoTriggerLambda);

    uploadBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(UploadedVideoTriggerLambda)
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
