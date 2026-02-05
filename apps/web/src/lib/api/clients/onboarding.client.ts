/**
 * Onboarding domain client.
 * Handles onboarding status, templates, preview, and deployment.
 */

import { BaseHttpClient } from '../base-client';
import type {
  OnboardingStatus,
  OnboardingTemplate,
  PreviewOnboardingPayload,
  PreviewOnboardingResult,
  DeployOnboardingPayload,
  DeployOnboardingResult,
  ValidateAwsPayload,
  ValidateAwsResult,
  DeployStatusResult,
} from '../types/onboarding';

export class OnboardingClient extends BaseHttpClient {
  /**
   * Get onboarding status.
   */
  getStatus(): Promise<OnboardingStatus> {
    return this.get('/onboarding/status');
  }

  /**
   * Get available onboarding templates.
   */
  getTemplates(): Promise<OnboardingTemplate[]> {
    return this.get('/onboarding/templates');
  }

  /**
   * Preview config for onboarding.
   */
  preview(data: PreviewOnboardingPayload): Promise<PreviewOnboardingResult> {
    return this.post('/onboarding/preview', data);
  }

  /**
   * Deploy a new bot via onboarding.
   */
  deploy(data: DeployOnboardingPayload): Promise<DeployOnboardingResult> {
    return this.post('/onboarding/deploy', data);
  }

  /**
   * Validate AWS credentials.
   */
  validateAwsCredentials(data: ValidateAwsPayload): Promise<ValidateAwsResult> {
    return this.post('/onboarding/validate-aws', data);
  }

  /**
   * Get deployment status for an instance.
   */
  getDeployStatus(instanceId: string): Promise<DeployStatusResult> {
    return this.get(`/onboarding/deploy/${instanceId}/status`);
  }
}

export const onboardingClient = new OnboardingClient();
