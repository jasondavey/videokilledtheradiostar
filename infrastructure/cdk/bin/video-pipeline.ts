#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { VideoPipelineStack } from "../lib/video-pipeline-stack";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

new VideoPipelineStack(app, "VideoPipelineStack", { env });
