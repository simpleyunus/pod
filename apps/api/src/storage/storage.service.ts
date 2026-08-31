import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService implements OnModuleInit {
  private s3: S3Client;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.s3 = new S3Client({
      endpoint: this.config.get('S3_ENDPOINT', 'http://localhost:9000'),
      region: 'us-east-1',
      credentials: {
        accessKeyId: this.config.get('S3_ACCESS_KEY', 'pod'),
        secretAccessKey: this.config.get('S3_SECRET_KEY', 'minio_dev_password'),
      },
      forcePathStyle: true,
    });
  }

  async ensureBucket(bucket: string) {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await this.s3.send(new CreateBucketCommand({ Bucket: bucket }));
    }
  }

  async upload(buffer: Buffer, bucket: string, key: string, mimeType: string) {
    await this.ensureBucket(bucket);
    await this.s3.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: mimeType }),
    );
    return { bucket, key };
  }

  async getPresignedUrl(bucket: string, key: string, expiresIn = 3600) {
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(this.s3, cmd, { expiresIn });
  }

  async getObject(bucket: string, key: string): Promise<Buffer> {
    const res = await this.s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as any) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
