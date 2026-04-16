import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from './env.js';
import sharp from 'sharp';

// R2のS3互換エンドポイントと認証情報を使ってS3クライアントを初期化
export const r2 = new S3Client({
  region: 'auto', // R2ではregionは'auto'でOK
  endpoint: env.r2Endpoint,
  credentials: {
    accessKeyId: env.awsAccessKeyId,
    secretAccessKey: env.awsSecretAccessKey,
  },
});

/**
 * Cloudflare R2にファイルをアップロードする関数
 * アップロード前に画像をJPEGに変換します。
 * @param key R2バケット内のオブジェクトキー（ファイル名、拡張子なし）
 * @param body アップロードするファイルの内容 (Buffer, Uint8Array, Blobなど)
 * @param originalContentType 元のファイルのContent-Type (例: 'image/jpeg', 'image/png')
 * @returns アップロードされたファイルの公開URL (JPEG形式)
 */
export async function uploadToR2AsJpeg(key: string, body: Buffer | Uint8Array | Blob, _originalContentType: string): Promise<string> {
  let processedBuffer: Buffer;
  let uploadContentType: string = 'image/jpeg';

  try {
    // sharpを使って画像をJPEGに変換
    // inputがBlobの場合、Bufferに変換してからsharpに渡す
    const inputBuffer = body instanceof Blob ? Buffer.from(await body.arrayBuffer()) : Buffer.from(body);

    processedBuffer = await sharp(inputBuffer)
      .jpeg({ quality: 80 }) // JPEG形式に変換し、品質を80に設定
      .toBuffer();
  } catch (error) {
    console.error('Image processing failed with sharp:', error);
    throw new Error('Failed to process image for upload.');
  }

  const command = new PutObjectCommand({
    Bucket: env.r2BucketName,
    Key: `${key}.jpeg`, // キーに.jpeg拡張子を追加
    Body: processedBuffer,
    ContentType: uploadContentType,
  });

  await r2.send(command);

  if (!env.r2AccountId) {
    throw new Error('R2_ACCOUNT_ID is not set in environment variables. Cannot construct public URL.');
  }
  return `https://pub-${env.r2AccountId}.r2.dev/${key}.jpeg`; // URLも.jpeg拡張子付きで返す
}