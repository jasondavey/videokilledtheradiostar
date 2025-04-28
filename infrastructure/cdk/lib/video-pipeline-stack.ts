import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
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

    //S3 Buckets
    const uploadBucket = new s3.Bucket(this, "UploadBucket", {
      bucketName: `video-sanitizer-uploads`, // Ensure unique name
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Use RETAIN for production
      autoDeleteObjects: true, // Disable for production
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED, // Simplify ownership
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // Maximum security
    });

    uploadBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ["s3:ListBucket", "s3:GetBucketLocation"],
        principals: [new iam.ServicePrincipal("transcribe.amazonaws.com")],
        resources: [uploadBucket.bucketArn],
      })
    );

    uploadBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket",
          "s3:GetBucketAcl",
        ],
        resources: [uploadBucket.bucketArn, `${uploadBucket.bucketArn}/*`],
        principals: [new iam.ServicePrincipal("transcribe.amazonaws.com")],
      })
    );

    //DynamoDB Table
    const videoMetadataTable = new dynamodb.Table(this, "VideoMetadataTable", {
      tableName: "VideoMetadata",
      partitionKey: { name: "videoId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const transcribeStartLambda = new NodejsFunction(
      this,
      "startTranscribeLambda",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: path.resolve(
          __dirname,
          "../../../services/lambda/transcribeStart/index.ts"
        ),
        handler: "handler",
        environment: {
          UPLOAD_BUCKET: uploadBucket.bucketName,
        },
      }
    );

    const transcribeStatusCheckLambda = new NodejsFunction(
      this,
      "transcribeStatusCheckLambda",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: path.resolve(
          __dirname,
          "../../../services/lambda/transcribeStatusCheck/index.ts"
        ),
        handler: "handler",
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

    const uploadedVideoTriggerLambda = new NodejsFunction(
      this,
      "UploadedVideoTrigger",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: path.resolve(
          __dirname,
          "../../../services/lambda/uploadedVideoTrigger/index.ts"
        ),
        handler: "handler",
        environment: {
          STATE_MACHINE_ARN: stateMachine.stateMachineArn,
        },
      }
    );

    // Allow Lambda to start the State Machine
    uploadBucket.grantRead(transcribeStartLambda);
    uploadBucket.grantReadWrite(transcribeStatusCheckLambda);
    stateMachine.grantStartExecution(uploadedVideoTriggerLambda);

    const transcribeServiceRole = new iam.Role(this, "TranscribeServiceRole", {
      assumedBy: new iam.ServicePrincipal("transcribe.amazonaws.com"),
    });

    // Grant the Transcribe service role access to the bucket
    uploadBucket.grantReadWrite(transcribeServiceRole);

    // Then pass this role in your Lambda environment vars
    transcribeStartLambda.addEnvironment(
      "TRANSCRIBE_SERVICE_ROLE_ARN",
      transcribeServiceRole.roleArn
    );

    uploadBucket.grantRead(uploadedVideoTriggerLambda);

    // Wire S3 Object Created -> Trigger Lambda
    uploadBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(uploadedVideoTriggerLambda)
    );

    //Outputs
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
