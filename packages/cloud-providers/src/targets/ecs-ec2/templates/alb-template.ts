/**
 * Application Load Balancer CloudFormation resources builder.
 *
 * Creates ALB resources for the ECS EC2 deployment:
 * - Internet-facing Application Load Balancer
 * - Target Group for ECS tasks
 * - HTTP/HTTPS Listeners (conditional on certificate)
 * - Gateway Token Secret (optional)
 */

import type { CloudFormationResources } from "./types";

/** Result from ALB resource builder */
export interface AlbResourcesResult {
  resources: CloudFormationResources;
  listenerDependency: string;
}

/**
 * Builds ALB, target group, and listener resources.
 *
 * @param botName - The bot name used for resource naming and tagging
 * @param gatewayPort - The OpenClaw gateway port number
 * @param certificateArn - Optional ACM certificate ARN for HTTPS
 * @param gatewayAuthToken - Optional gateway authentication token
 * @returns CloudFormation resources and the listener dependency name
 */
export function buildAlbResources(
  botName: string,
  gatewayPort: number,
  certificateArn?: string,
  gatewayAuthToken?: string,
): AlbResourcesResult {
  const tag = { Key: "clawster:bot", Value: botName };

  const resources: CloudFormationResources = {
    Alb: {
      Type: "AWS::ElasticLoadBalancingV2::LoadBalancer",
      Properties: {
        Name: { "Fn::Sub": `clawster-${botName}` },
        Scheme: "internet-facing",
        Type: "application",
        Subnets: [{ Ref: "PublicSubnet1" }, { Ref: "PublicSubnet2" }],
        SecurityGroups: [{ Ref: "AlbSecurityGroup" }],
        Tags: [tag],
      },
    },

    AlbTargetGroup: {
      Type: "AWS::ElasticLoadBalancingV2::TargetGroup",
      Properties: {
        Name: { "Fn::Sub": `clawster-${botName}-tg` },
        Port: gatewayPort,
        Protocol: "HTTP",
        VpcId: { Ref: "Vpc" },
        TargetType: "ip",
        HealthCheckEnabled: true,
        HealthCheckPath: "/",
        HealthCheckPort: String(gatewayPort),
        HealthCheckProtocol: "HTTP",
        HealthCheckIntervalSeconds: 5,
        HealthCheckTimeoutSeconds: 3,
        HealthyThresholdCount: 2,
        UnhealthyThresholdCount: 3,
        Tags: [tag],
      },
    },
  };

  // Determine listener configuration based on certificate
  let listenerDependency: string;

  if (certificateArn) {
    // HTTPS on 443 + HTTP redirect
    resources.AlbHttpsListener = {
      Type: "AWS::ElasticLoadBalancingV2::Listener",
      Properties: {
        LoadBalancerArn: { Ref: "Alb" },
        Port: 443,
        Protocol: "HTTPS",
        Certificates: [{ CertificateArn: certificateArn }],
        DefaultActions: [
          {
            Type: "forward",
            TargetGroupArn: { Ref: "AlbTargetGroup" },
          },
        ],
      },
    };
    resources.AlbHttpRedirectListener = {
      Type: "AWS::ElasticLoadBalancingV2::Listener",
      Properties: {
        LoadBalancerArn: { Ref: "Alb" },
        Port: 80,
        Protocol: "HTTP",
        DefaultActions: [
          {
            Type: "redirect",
            RedirectConfig: {
              Protocol: "HTTPS",
              Port: "443",
              StatusCode: "HTTP_301",
            },
          },
        ],
      },
    };
    listenerDependency = "AlbHttpsListener";
  } else {
    // Plain HTTP listener on 80
    resources.AlbHttpListener = {
      Type: "AWS::ElasticLoadBalancingV2::Listener",
      Properties: {
        LoadBalancerArn: { Ref: "Alb" },
        Port: 80,
        Protocol: "HTTP",
        DefaultActions: [
          {
            Type: "forward",
            TargetGroupArn: { Ref: "AlbTargetGroup" },
          },
        ],
      },
    };
    listenerDependency = "AlbHttpListener";
  }

  // Gateway Token Secret (optional)
  if (gatewayAuthToken) {
    resources.GatewayTokenSecret = {
      Type: "AWS::SecretsManager::Secret",
      Properties: {
        Name: { "Fn::Sub": `clawster/${botName}/gateway-token` },
        Description: {
          "Fn::Sub": `Gateway auth token for bot "${botName}"`,
        },
        SecretString: gatewayAuthToken,
        Tags: [tag],
      },
    };
  }

  return { resources, listenerDependency };
}
