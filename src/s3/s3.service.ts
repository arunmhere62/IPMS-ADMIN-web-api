import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ResponseUtil } from '../common/utils/response.util';
import { ApiResponseDto } from '../common/dto/response.dto';

@Injectable()
export class S3Service {
  private s3Client: S3Client;

  constructor() {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_REGION || 'ap-south-1';

    if (!accessKeyId || !secretAccessKey) {
      throw new InternalServerErrorException(
        'Missing AWS credentials: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY',
      );
    }

    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async uploadFile(uploadData: {
    key: string;
    contentType: string;
    fileData: string;
    isPublic: boolean;
    bucket: string;
  }): Promise<ApiResponseDto<{ url: string; key: string }>> {
    const { key, contentType, fileData, bucket, isPublic } = uploadData;

    if (!bucket || !key || !contentType || !fileData) {
      throw new BadRequestException('Missing required upload fields');
    }

    try {
      const buffer = Buffer.from(fileData, 'base64');

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ...(isPublic ? { ACL: 'public-read' } : {}),
      });

      await this.s3Client.send(command);

      return ResponseUtil.created(
        {
          url: `https://${bucket}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${key}`,
          key,
        },
        'File uploaded successfully',
      );
    } catch (error: any) {
      throw new InternalServerErrorException(
        error?.message || 'Upload failed',
      );
    }
  }

  async deleteFile(deleteData: {
    key: string;
    bucket: string;
  }): Promise<ApiResponseDto<{ key: string }>> {
    const { key, bucket } = deleteData;

    if (!bucket || !key) {
      throw new BadRequestException('Missing required delete fields');
    }

    try {
      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      await this.s3Client.send(command);
      return ResponseUtil.success({ key }, 'File deleted successfully');
    } catch (error: any) {
      throw new InternalServerErrorException(
        error?.message || 'Delete failed',
      );
    }
  }

  async deleteMultipleFiles(deleteData: {
    keys: string[];
    bucket: string;
  }): Promise<ApiResponseDto<{ keys: string[] }>> {
    const { keys, bucket } = deleteData;

    if (!bucket || !keys || !Array.isArray(keys) || keys.length === 0) {
      throw new BadRequestException('Missing required keys/bucket');
    }

    try {
      const command = new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: keys.map((key) => ({ Key: key })),
        },
      });

      await this.s3Client.send(command);
      return ResponseUtil.success({ keys }, 'Files deleted successfully');
    } catch (error: any) {
      throw new InternalServerErrorException(
        error?.message || 'Bulk delete failed',
      );
    }
  }

  async fileExists(query: {
    key: string;
    bucket: string;
  }): Promise<ApiResponseDto<{ exists: boolean }>> {
    const { key, bucket } = query;

    if (!bucket || !key) {
      throw new BadRequestException('Missing required query params');
    }

    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    try {
      await this.s3Client.send(command);
      return ResponseUtil.success({ exists: true });
    } catch (error: any) {
      if (error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) {
        return ResponseUtil.success({ exists: false });
      }
      throw new InternalServerErrorException(
        error?.message || 'Exists check failed',
      );
    }
  }

  health(): ApiResponseDto<{ available: boolean }> {
    return ResponseUtil.success({ available: true });
  }
}
