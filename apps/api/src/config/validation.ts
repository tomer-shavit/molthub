import * as Joi from "joi";

export const configValidationSchema = Joi.object({
  // Required
  DATABASE_URL: Joi.string().required(),
  JWT_SECRET: Joi.string().min(32).required(),
  AWS_REGION: Joi.string().default("us-east-1"),

  // Optional with defaults
  PORT: Joi.number().default(4000),
  NODE_ENV: Joi.string().valid("development", "production", "test").default("development"),
  FRONTEND_URL: Joi.string().uri().default("http://localhost:3000"),

  // AWS (optional - only required for ECS/cloud deployments)
  AWS_ACCESS_KEY_ID: Joi.string().allow('').optional(),
  AWS_SECRET_ACCESS_KEY: Joi.string().allow('').optional(),
  AWS_ACCOUNT_ID: Joi.string().allow('').optional(),

  // ECS Infrastructure (optional - only required for ECS deployments)
  ECS_CLUSTER_ARN: Joi.string().allow('').optional(),
  ECS_EXECUTION_ROLE_ARN: Joi.string().allow('').optional(),
  ECS_TASK_ROLE_ARN: Joi.string().allow('').optional(),
  PRIVATE_SUBNET_IDS: Joi.string().allow('').optional(),
  SECURITY_GROUP_ID: Joi.string().allow('').optional(),

  // Features
  AUTO_RECONCILE_ON_DRIFT: Joi.boolean().default(false),

  // Default deployment target
  DEFAULT_DEPLOYMENT_TARGET: Joi.string()
    .valid("docker", "local", "kubernetes", "ecs-ec2", "gce", "azure-vm")
    .default("docker"),
});
