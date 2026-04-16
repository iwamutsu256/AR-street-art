import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from './env.js';
import sharp from 'sharp';
import { BlockList } from 'node:net';

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

/**
 * 壁に関連する複数の画像をR2にアップロードする関数 (フロントエンドから処理済み画像を受け取る版)
 * @param wallId 壁のID
 * @param originalImageFile オリジナル画像ファイル (MultipartFile)
 * @param thumbnailImageFile サムネイル画像ファイル (MultipartFile)
 * @param rectifiedImageFile 射影変換済み画像ファイル (MultipartFile)
 * @returns アップロードされた各画像のURLを含むオブジェクト
 */
export async function uploadWallImagesToR2(
  wallId: string,
  originalImageFile: File | Blob,
  thumbnailImageFile: File | Blob,
  rectifiedImageFile: File | Blob,
): Promise<{
  originalImageUrl: string;
  thumbnailImageUrl: string;
  rectifiedImageUrl: string;
}> {
  if (!env.r2AccountId) {
    throw new Error('R2_ACCOUNT_ID is not set in environment variables. Cannot construct public URL.');
  }

  const originalImageBuffer = Buffer.from(await originalImageFile.arrayBuffer());
  const thumbnailImageBuffer = Buffer.from(await thumbnailImageFile.arrayBuffer());
  const rectifiedImageBuffer = Buffer.from(await rectifiedImageFile.arrayBuffer());

  const originalImageContentType = originalImageFile.type;
  const thumbnailImageContentType = thumbnailImageFile.type;
  const rectifiedImageContentType = rectifiedImageFile.type;

  const originalKey = `walls/${wallId}/original`;
  const originalImageUrl = await uploadToR2AsJpeg(originalKey, originalImageBuffer, originalImageContentType);

  const thumbnailKey = `walls/${wallId}/thumbnail`;
  const thumbnailImageUrl = await uploadToR2AsJpeg(thumbnailKey, thumbnailImageBuffer, thumbnailImageContentType);

  const rectifiedKey = `walls/${wallId}/wall-rectified`;
  const rectifiedImageUrl = await uploadToR2AsJpeg(rectifiedKey, rectifiedImageBuffer, rectifiedImageContentType);

  return {
    originalImageUrl,
    thumbnailImageUrl,
    rectifiedImageUrl,
  }
}