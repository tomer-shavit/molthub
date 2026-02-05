/**
 * Templates domain client.
 * Handles template CRUD and config preview.
 */

import { BaseHttpClient } from '../base-client';
import type {
  Template,
  CreateTemplatePayload,
  TemplateConfigPreview,
  PreviewTemplateConfigPayload,
} from '../types/templates';

export class TemplatesClient extends BaseHttpClient {
  /**
   * List all templates.
   */
  list(): Promise<Template[]> {
    return this.get('/templates');
  }

  /**
   * Get a single template by ID.
   */
  getById(id: string): Promise<Template> {
    return this.get(`/templates/${id}`);
  }

  /**
   * Create a new template.
   */
  create(data: CreateTemplatePayload): Promise<Template> {
    return this.post('/templates', data);
  }

  /**
   * Preview config for a template with values.
   */
  previewConfig(id: string, data: PreviewTemplateConfigPayload): Promise<TemplateConfigPreview> {
    return this.post(`/templates/${id}/preview`, data);
  }
}

export const templatesClient = new TemplatesClient();
