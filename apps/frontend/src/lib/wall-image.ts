'use client';

import type { CornerCoordinate } from '@street-art/shared';
import { getCornerAspectRatio } from './walls';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MIN_SHORT_EDGE = 1080;
const MAX_ORIGINAL_LONG_EDGE = 3840;
const THUMBNAIL_SIZE = 800;
const RECTIFIED_MAX_LONG_EDGE = 1920;

export type WallImageMetadata = {
  width: number;
  height: number;
  aspectRatio: number;
  willDownscaleOriginal: boolean;
};

export type RectifiedImageAsset = {
  rectifiedImageFile: File;
  width: number;
  height: number;
  aspectRatio: number;
};

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getContext2d(canvas: HTMLCanvasElement, options?: CanvasRenderingContext2DSettings) {
  const context = canvas.getContext('2d', options);

  if (!context) {
    throw new Error('Canvas 2D context could not be created.');
  }

  return context;
}

function loadImageFromUrl(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('画像の読み込みに失敗しました。'));
    image.src = url;
  });
}

async function loadImageFromFile(file: File) {
  const objectUrl = URL.createObjectURL(file);

  try {
    return await loadImageFromUrl(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function canvasToJpegFile(canvas: HTMLCanvasElement, name: string, quality = 0.86) {
  return new Promise<File>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('画像を書き出せませんでした。'));
          return;
        }

        resolve(new File([blob], name, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      quality
    );
  });
}

function getLimitedSize(width: number, height: number, maxLongEdge: number) {
  const longEdge = Math.max(width, height);

  if (longEdge <= maxLongEdge) {
    return { width, height };
  }

  const scale = maxLongEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function getAspectRatioSize(aspectRatio: number, maxLongEdge: number) {
  if (aspectRatio >= 1) {
    return {
      width: maxLongEdge,
      height: Math.max(1, Math.round(maxLongEdge / aspectRatio)),
    };
  }

  return {
    width: Math.max(1, Math.round(maxLongEdge * aspectRatio)),
    height: maxLongEdge,
  };
}

function bilinearCoordinate(
  topLeft: number,
  topRight: number,
  bottomRight: number,
  bottomLeft: number,
  u: number,
  v: number
) {
  return (
    topLeft * (1 - u) * (1 - v) +
    topRight * u * (1 - v) +
    bottomRight * u * v +
    bottomLeft * (1 - u) * v
  );
}

function sampleBilinear(data: Uint8ClampedArray, width: number, height: number, x: number, y: number) {
  const clampedX = Math.min(Math.max(x, 0), width - 1);
  const clampedY = Math.min(Math.max(y, 0), height - 1);
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const wx = clampedX - x0;
  const wy = clampedY - y0;

  const topLeftIndex = (y0 * width + x0) * 4;
  const topRightIndex = (y0 * width + x1) * 4;
  const bottomLeftIndex = (y1 * width + x0) * 4;
  const bottomRightIndex = (y1 * width + x1) * 4;

  return [0, 1, 2, 3].map((channel) => {
    const top =
      data[topLeftIndex + channel] * (1 - wx) + data[topRightIndex + channel] * wx;
    const bottom =
      data[bottomLeftIndex + channel] * (1 - wx) + data[bottomRightIndex + channel] * wx;
    return Math.round(top * (1 - wy) + bottom * wy);
  });
}

function renderOriginalImage(image: HTMLImageElement) {
  const { width, height } = getLimitedSize(
    image.naturalWidth,
    image.naturalHeight,
    MAX_ORIGINAL_LONG_EDGE
  );
  const canvas = createCanvas(width, height);
  const context = getContext2d(canvas);
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

function renderThumbnailImage(image: HTMLImageElement) {
  const canvas = createCanvas(THUMBNAIL_SIZE, THUMBNAIL_SIZE);
  const context = getContext2d(canvas);
  const scale = THUMBNAIL_SIZE / Math.min(image.naturalWidth, image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const offsetX = (THUMBNAIL_SIZE - drawWidth) / 2;
  const offsetY = (THUMBNAIL_SIZE - drawHeight) / 2;

  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  return canvas;
}

function renderRectifiedImage(
  image: HTMLImageElement,
  corners: CornerCoordinate[]
) {
  const aspectRatio = getCornerAspectRatio(corners);
  const targetLongEdge = Math.min(
    RECTIFIED_MAX_LONG_EDGE,
    Math.max(image.naturalWidth, image.naturalHeight)
  );
  const targetSize = getAspectRatioSize(aspectRatio, targetLongEdge);

  const sourceCanvas = createCanvas(image.naturalWidth, image.naturalHeight);
  const sourceContext = getContext2d(sourceCanvas, { willReadFrequently: true });
  sourceContext.drawImage(image, 0, 0);

  const sourceImage = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const resultCanvas = createCanvas(targetSize.width, targetSize.height);
  const resultContext = getContext2d(resultCanvas);
  const output = resultContext.createImageData(targetSize.width, targetSize.height);

  for (let y = 0; y < targetSize.height; y += 1) {
    const v = targetSize.height === 1 ? 0 : y / (targetSize.height - 1);

    for (let x = 0; x < targetSize.width; x += 1) {
      const u = targetSize.width === 1 ? 0 : x / (targetSize.width - 1);
      const sourceX = bilinearCoordinate(
        corners[0].x,
        corners[1].x,
        corners[2].x,
        corners[3].x,
        u,
        v
      );
      const sourceY = bilinearCoordinate(
        corners[0].y,
        corners[1].y,
        corners[2].y,
        corners[3].y,
        u,
        v
      );
      const [red, green, blue, alpha] = sampleBilinear(
        sourceImage.data,
        sourceImage.width,
        sourceImage.height,
        sourceX,
        sourceY
      );
      const targetIndex = (y * targetSize.width + x) * 4;
      output.data[targetIndex] = red;
      output.data[targetIndex + 1] = green;
      output.data[targetIndex + 2] = blue;
      output.data[targetIndex + 3] = alpha;
    }
  }

  resultContext.putImageData(output, 0, 0);
  return resultCanvas;
}

export async function inspectWallImage(file: File) {
  const errors: string[] = [];

  if (file.size > MAX_UPLOAD_BYTES) {
    errors.push('画像ファイルは 10MB 以下にしてください。');
  }

  const image = await loadImageFromFile(file);
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const aspectRatio = width / height;

  if (aspectRatio < 1 / 3 || aspectRatio > 3) {
    errors.push('アスペクト比は 1:3 から 3:1 の範囲にしてください。');
  }

  if (Math.min(width, height) < MIN_SHORT_EDGE) {
    errors.push(`短辺 ${MIN_SHORT_EDGE}px 以上の画像を選択してください。`);
  }

  return {
    metadata: {
      width,
      height,
      aspectRatio,
      willDownscaleOriginal: Math.max(width, height) > MAX_ORIGINAL_LONG_EDGE,
    } satisfies WallImageMetadata,
    errors,
  };
}

export async function buildWallImageFiles(options: {
  file: File;
  rectifiedImageFile: File;
}) {
  const image = await loadImageFromFile(options.file);

  const originalCanvas = renderOriginalImage(image);
  const thumbnailCanvas = renderThumbnailImage(image);

  const [originalImageFile, thumbnailImageFile] = await Promise.all([
    canvasToJpegFile(originalCanvas, 'original.jpg', 0.88),
    canvasToJpegFile(thumbnailCanvas, 'thumbnail.jpg', 0.84),
  ]);

  return {
    originalImageFile,
    thumbnailImageFile,
    rectifiedImageFile: options.rectifiedImageFile,
  };
}

export async function buildRectifiedImageAsset(options: {
  file: File;
  corners: CornerCoordinate[];
}): Promise<RectifiedImageAsset> {
  const image = await loadImageFromFile(options.file);
  const rectifiedCanvas = renderRectifiedImage(image, options.corners);
  const rectifiedImageFile = await canvasToJpegFile(rectifiedCanvas, 'rectified.jpg', 0.88);

  return {
    rectifiedImageFile,
    width: rectifiedCanvas.width,
    height: rectifiedCanvas.height,
    aspectRatio: rectifiedCanvas.width / rectifiedCanvas.height,
  };
}
