/**
 * Profiles domain client.
 * Handles profile CRUD operations.
 */

import { BaseHttpClient } from '../base-client';
import type {
  Profile,
  CreateProfilePayload,
  UpdateProfilePayload,
  ProfileFilters,
} from '../types/profiles';

export class ProfilesClient extends BaseHttpClient {
  /**
   * List all profiles with optional filters.
   */
  list(filters?: ProfileFilters): Promise<Profile[]> {
    return this.get('/profiles', filters);
  }

  /**
   * Get a single profile by ID.
   */
  getById(id: string): Promise<Profile> {
    return this.get(`/profiles/${id}`);
  }

  /**
   * Create a new profile.
   */
  create(data: CreateProfilePayload): Promise<Profile> {
    return this.post('/profiles', data);
  }

  /**
   * Update a profile.
   */
  update(id: string, data: UpdateProfilePayload): Promise<Profile> {
    return this.patch(`/profiles/${id}`, data);
  }

  /**
   * Delete a profile.
   */
  deleteById(id: string): Promise<void> {
    return this.delete(`/profiles/${id}`);
  }
}

export const profilesClient = new ProfilesClient();
