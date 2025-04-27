#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { VideoPipelineStack } from "../lib/video-pipeline-stack";

const app = new cdk.App();

new VideoPipelineStack(app, "VideoPipelineStack");
