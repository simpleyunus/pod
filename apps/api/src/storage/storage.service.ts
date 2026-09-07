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
  // Second client used ONLY to sign download URLs. In production the API
  // reaches MinIO at http://minio:9000 on the compose network, but a browser
  // cannot resolve that host — a URL signed against it is undownloadable.
  // A SigV4 signature covers the Host header, so the public host cannot be
  // patched into the string afterwards; it has to be signed with. Where the
  // two are the same (development) this is the same endpoint and costs
  // nothing.
  private s3Public: S3Client;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const credentials = {
      accessKeyId: this.config.get('S3_ACCESS_KEY', 'pod'),
      secretAccessKey: this.config.get('S3_SECRET_KEY', 'minio_dev_password'),
    };
    const internal = this.config.get('S3_ENDPOINT', 'http://localhost:9000');
    const external = this.config.get('S3_PUBLIC_ENDPOINT', internal);

    this.s3 = new S3Client({
      endpoint: internal,
      region: 'us-east-1',
      credentials,
      forcePathStyle: true,
    });
    this.s3Public = new S3Client({
      endpoint: external,
      region: 'us-east-1',
      credentials,
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

  /** A link the BROWSER can follow — signed against the public endpoint. */
  async getPresignedUrl(bucket: string, key: string, expiresIn = 3600) {
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(this.s3Public, cmd, { expiresIn });
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
