import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseStorageService {
  private readonly client: SupabaseClient;

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.getOrThrow<string>('supabase.url');
    const serviceRoleKey = this.configService.getOrThrow<string>(
      'supabase.serviceRoleKey',
    );

    this.client = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  async uploadFile(
    bucket: string,
    path: string,
    file: Buffer,
    contentType?: string,
  ) {
    return this.client.storage.from(bucket).upload(path, file, {
      contentType,
      upsert: true,
    });
  }

  async removeFile(bucket: string, path: string) {
    return this.client.storage.from(bucket).remove([path]);
  }

  getPublicUrl(bucket: string, path: string) {
    return this.client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  /**
   * Lightweight connectivity probe used by the health check. Throws when
   * Supabase is unreachable or the credentials are invalid.
   */
  async ping(): Promise<void> {
    const { error } = await this.client.storage.listBuckets();
    if (error) {
      throw error;
    }
  }
}
