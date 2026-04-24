'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  CANVAS_MAX_SIZE,
  DEFAULT_CANVAS_SIZE,
  type CreateWallResponse,
} from '@street-art/shared';
import { CornerEditor } from './CornerEditor';
import { LocationPicker } from './LocationPicker';
import {
  buildRectifiedImageAsset,
  buildWallImageFiles,
  inspectWallImage,
  prepareWallImageFile,
  type RectifiedImageAsset,
  WALL_IMAGE_INPUT_ACCEPT,
} from '../../lib/wall-image';
import {
  CANVAS_MIN_SIZE,
  formatCoordinate,
  getCanvasDimensions,
  getDefaultCornerCoordinates,
  serializeCornerCoordinates,
} from '../../lib/walls';

type SelectedImage = {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  willDownscaleOriginal: boolean;
};

type RectifiedPreview = RectifiedImageAsset & {
  previewUrl: string;
};

type WallFormValues = {
  name: string;
  latitude: string;
  longitude: string;
};

type NewWallFormProps = {
  mapTilerKey: string;
};

function parseCoordinate(value: string, min: number, max: number) {
  if (value.trim() === '') {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return null;
  }

  return parsed;
}

function extractErrorMessages(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return ['壁の登録に失敗しました。'];
  }

  const messages: string[] = [];

  if ('errors' in payload && Array.isArray(payload.errors)) {
    for (const error of payload.errors) {
      if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
        messages.push(error.message);
      }
    }
  }

  if ('message' in payload && typeof payload.message === 'string') {
    messages.push(payload.message);
  }

  return messages.length > 0 ? messages : ['壁の登録に失敗しました。'];
}

export function NewWallForm({ mapTilerKey }: NewWallFormProps) {
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [rectifiedPreview, setRectifiedPreview] = useState<RectifiedPreview | null>(null);
  const [corners, setCorners] = useState(getDefaultCornerCoordinates(1200, 800));
  const [canvasLongSide, setCanvasLongSide] = useState(DEFAULT_CANVAS_SIZE);
  const [values, setValues] = useState<WallFormValues>({
    name: '',
    latitude: '',
    longitude: '',
  });
  const [uploadIssues, setUploadIssues] = useState<string[]>([]);
  const [messages, setMessages] = useState<string[]>([]);
  const [rectifyPhase, setRectifyPhase] = useState<string | null>(null);
  const [submitPhase, setSubmitPhase] = useState<string | null>(null);
  const [success, setSuccess] = useState<CreateWallResponse | null>(null);

  useEffect(() => {
    if (!selectedImage) {
      return;
    }

    return () => {
      URL.revokeObjectURL(selectedImage.previewUrl);
    };
  }, [selectedImage]);

  useEffect(() => {
    if (!rectifiedPreview) {
      return;
    }

    return () => {
      URL.revokeObjectURL(rectifiedPreview.previewUrl);
    };
  }, [rectifiedPreview]);

  const canvasAspectRatio = rectifiedPreview?.aspectRatio ?? 1;
  const canvasDimensions = getCanvasDimensions(canvasLongSide, canvasAspectRatio);
  const latitude = parseCoordinate(values.latitude, -90, 90);
  const longitude = parseCoordinate(values.longitude, -180, 180);
  const canSubmit =
    Boolean(selectedImage) &&
    Boolean(rectifiedPreview) &&
    values.name.trim().length > 0 &&
    latitude !== null &&
    longitude !== null &&
    !rectifyPhase &&
    !submitPhase;

  async function handleImageSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setMessages([]);
    setUploadIssues([]);
    setSuccess(null);
    setRectifyPhase(null);
    setSubmitPhase(null);
    setRectifiedPreview(null);

    try {
      const preparedImage = await prepareWallImageFile(file);
      const inspection = await inspectWallImage(preparedImage.file, {
        originalFileSize: preparedImage.originalFileSize,
      });

      if (inspection.errors.length > 0) {
        setSelectedImage(null);
        setCorners(getDefaultCornerCoordinates(1200, 800));
        setUploadIssues([...inspection.errors, '別のファイルをアップロードしてください。']);
        event.currentTarget.value = '';
        return;
      }

      const nextPreviewUrl = URL.createObjectURL(preparedImage.file);
      setSelectedImage({
        file: preparedImage.file,
        previewUrl: nextPreviewUrl,
        width: inspection.metadata.width,
        height: inspection.metadata.height,
        willDownscaleOriginal: inspection.metadata.willDownscaleOriginal,
      });
      setCorners(getDefaultCornerCoordinates(inspection.metadata.width, inspection.metadata.height));
      setCanvasLongSide(DEFAULT_CANVAS_SIZE);
    } catch (error) {
      setSelectedImage(null);
      setUploadIssues([
        error instanceof Error ? error.message : '画像の読み込みに失敗しました。',
        '別のファイルをアップロードしてください。',
      ]);
      event.currentTarget.value = '';
    }
  }

  function handleCornerChange(nextCorners: typeof corners) {
    setCorners(nextCorners);

    if (rectifiedPreview) {
      setRectifiedPreview(null);
    }
  }

  async function handleGenerateRectified() {
    if (!selectedImage) {
      setMessages(['先に壁画像をアップロードしてください。']);
      return;
    }

    setMessages([]);
    setRectifyPhase('rectified を生成しています…');

    try {
      const nextRectifiedAsset = await buildRectifiedImageAsset({
        file: selectedImage.file,
        corners,
      });

      setRectifiedPreview({
        ...nextRectifiedAsset,
        previewUrl: URL.createObjectURL(nextRectifiedAsset.rectifiedImageFile),
      });
      setRectifyPhase(null);
    } catch (error) {
      setMessages([
        error instanceof Error ? error.message : 'rectified の生成に失敗しました。',
      ]);
      setRectifyPhase(null);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedImage) {
      setMessages(['壁画像をアップロードしてください。']);
      return;
    }

    if (!rectifiedPreview) {
      setMessages(['Step 2 でハンドル位置を確定し、rectified を生成してください。']);
      return;
    }

    if (latitude === null || longitude === null) {
      setMessages(['緯度・経度を正しく入力してください。']);
      return;
    }

    setMessages([]);
    setSuccess(null);
    setSubmitPhase('Original と Thumbnail を生成しています…');

    try {
      const processedImages = await buildWallImageFiles({
        file: selectedImage.file,
        rectifiedImageFile: rectifiedPreview.rectifiedImageFile,
      });

      const formData = new FormData();
      formData.set('name', values.name.trim());
      formData.set('latitude', String(latitude));
      formData.set('longitude', String(longitude));
      formData.set('canvasWidth', String(canvasDimensions.width));
      formData.set('canvasHeight', String(canvasDimensions.height));
      formData.set('cornerCoordinates', JSON.stringify(serializeCornerCoordinates(corners)));
      formData.set('originalImageFile', processedImages.originalImageFile, processedImages.originalImageFile.name);
      formData.set(
        'thumbnailImageFile',
        processedImages.thumbnailImageFile,
        processedImages.thumbnailImageFile.name
      );
      formData.set(
        'rectifiedImageFile',
        processedImages.rectifiedImageFile,
        processedImages.rectifiedImageFile.name
      );

      setSubmitPhase('API に送信しています…');

      const response = await fetch('/api/walls', {
        method: 'POST',
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        setMessages(extractErrorMessages(payload));
        setSubmitPhase(null);
        return;
      }

      setSuccess(payload as CreateWallResponse);
      setSubmitPhase(null);
    } catch (error) {
      setMessages([
        error instanceof Error ? error.message : '画像処理またはアップロードに失敗しました。',
      ]);
      setSubmitPhase(null);
    }
  }

  return (
    <form className="stack-lg" onSubmit={handleSubmit}>
      {success ? (
        <div className="success-banner">
          <strong>{success.name} を登録しました。</strong>
          <div className="stack-sm" style={{ marginTop: 8 }}>
            <div>
              キャンバスサイズ: {success.canvas?.width} x {success.canvas?.height}px
            </div>
            <div className="mono">Wall ID: {success.id}</div>
            <div className="inline-actions">
              <Link className="button button-secondary" href="/">
                壁一覧へ戻る
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {messages.length > 0 ? (
        <div className="error-banner">
          <strong>入力内容を確認してください。</strong>
          <ul>
            {messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {submitPhase ? <div className="notice">{submitPhase}</div> : null}

      <section className="section-card">
        <div className="section-topline">
          <div className="stack-sm">
            <div className="step-badge">Step 1</div>
            <h2 className="section-title">写真をアップロード</h2>
            <p className="section-copy">
              壁全体が入り、四隅が見えていて、極端に斜めすぎず、暗すぎない写真を選んでください。
            </p>
          </div>
          <div className="tag">JPG / PNG / WebP / HEIC / HEIF に対応</div>
        </div>

        <ul className="upload-hints">
          <li>アスペクト比は 1:3 から 3:1 です。</li>
          <li>短辺 1080px 以上、ファイルサイズは 10MB 以下です。</li>
          <li>長辺が 3840px を超える場合は保存時に自動で縮小します。</li>
          <li>HEIC / HEIF は必要に応じて JPEG へ変換して処理します。</li>
        </ul>

        <label className="field-label">
          壁画像
          <input
            accept={WALL_IMAGE_INPUT_ACCEPT}
            onChange={handleImageSelection}
            type="file"
          />
        </label>

        {uploadIssues.length > 0 ? (
          <div className="error-banner" style={{ marginTop: 16 }}>
            <strong>この画像はアップロードできません。</strong>
            <ul>
              {uploadIssues.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {selectedImage ? (
          <div className="info-grid" style={{ marginTop: 16 }}>
            <div className="metric-pill">
              <strong>元サイズ</strong>
              <span>
                {selectedImage.width} x {selectedImage.height}px
              </span>
            </div>
            <div className="metric-pill">
              <strong>Original 保存</strong>
              <span>{selectedImage.willDownscaleOriginal ? '3840px 以内へ縮小' : 'そのまま JPEG 化'}</span>
            </div>
            <div className="metric-pill">
              <strong>Thumbnail</strong>
              <span>800 x 800px</span>
            </div>
          </div>
        ) : null}
      </section>

      <section className={`section-card ${selectedImage ? '' : 'section-card--muted'}`}>
        <div className="section-topline">
          <div className="stack-sm">
            <div className="step-badge">Step 2</div>
            <h2 className="section-title">キャンバス範囲を指定</h2>
            <p className="section-copy">
              4点を動かして範囲を決めたら、確定ボタンで rectified を生成します。ハンドルを動かした後は再生成が必要です。
            </p>
          </div>
        </div>

        {selectedImage ? (
          <div className="stack-md">
            <CornerEditor
              imageHeight={selectedImage.height}
              imageUrl={selectedImage.previewUrl}
              imageWidth={selectedImage.width}
              onChange={handleCornerChange}
              value={corners}
            />

            <div className="inline-actions">
              <button
                className="button button-primary"
                disabled={Boolean(rectifyPhase)}
                onClick={handleGenerateRectified}
                type="button"
              >
                {rectifyPhase
                  ? 'rectified 生成中…'
                  : rectifiedPreview
                    ? 'rectified を再生成'
                    : 'ハンドル位置を確定して rectified を生成'}
              </button>
              {rectifiedPreview ? (
                <div className="metric-pill">
                  <strong>生成済み</strong>
                  <span>
                    {rectifiedPreview.width} x {rectifiedPreview.height}px
                  </span>
                </div>
              ) : (
                <div className="tag">確定後に次のサイズ決定ステップへ進めます</div>
              )}
            </div>

            {rectifyPhase ? <div className="notice">{rectifyPhase}</div> : null}

            {rectifiedPreview ? (
              <div className="preview-frame">
                <div className="preview-image">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={rectifiedPreview.previewUrl} alt="生成した rectified プレビュー" />
                </div>
                <div className="notice">
                  rectified を生成しました。以降のキャンバスサイズはこの画像比率
                  （{rectifiedPreview.width} x {rectifiedPreview.height}）を基準に決めます。
                </div>
              </div>
            ) : (
              <div className="notice">
                ハンドル位置を確認したら「ハンドル位置を確定して rectified を生成」を押してください。
              </div>
            )}
          </div>
        ) : (
          <div className="empty-state">先に壁画像をアップロードすると、ここで四隅を調整できます。</div>
        )}
      </section>

      <section className={`section-card ${rectifiedPreview ? '' : 'section-card--muted'}`}>
        <div className="section-topline">
          <div className="stack-sm">
            <div className="step-badge">Step 3</div>
            <h2 className="section-title">キャンバスサイズを決める</h2>
            <p className="section-copy">
              スライダーは長辺のピクセル数です。Step 2 で生成した rectified のアスペクト比を基準に短辺を自動計算します。
            </p>
          </div>
          <Link className="button button-secondary" href="/canvas-size-guide" target="_blank">
            サイズガイドを開く
          </Link>
        </div>

        {rectifiedPreview ? (
          <div className="stack-md">
            <label className="field-label">
              長辺 {canvasLongSide}px
              <input
                className="range-input"
                max={CANVAS_MAX_SIZE}
                min={CANVAS_MIN_SIZE}
                onChange={(event) => setCanvasLongSide(Number(event.target.value))}
                type="range"
                value={canvasLongSide}
              />
            </label>

            <div className="canvas-summary">
              <div className="metric-pill">
                <strong>確定サイズ</strong>
                <span>
                  {canvasDimensions.width} x {canvasDimensions.height}px
                </span>
              </div>
              <div className="metric-pill">
                <strong>比率</strong>
                <span>
                  {canvasDimensions.width / canvasDimensions.height > 1
                    ? '横長'
                    : canvasDimensions.width === canvasDimensions.height
                      ? '正方形'
                      : '縦長'}
                </span>
              </div>
              <div className="metric-pill">
                <strong>Rectified 基準</strong>
                <span>
                  {rectifiedPreview.width} x {rectifiedPreview.height}px
                </span>
              </div>
            </div>

            <div className="preview-frame">
              <div className="preview-image">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={rectifiedPreview.previewUrl} alt="rectified プレビュー" />
              </div>
              <div className="canvas-proportion">
                <div
                  className="canvas-proportion__shape"
                  style={{ aspectRatio: `${canvasDimensions.width} / ${canvasDimensions.height}` }}
                >
                  {canvasDimensions.width} x {canvasDimensions.height}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            Step 2 でハンドル位置を確定して rectified を生成すると、ここでサイズを決められます。
          </div>
        )}
      </section>

      <section className="section-card">
        <div className="section-topline">
          <div className="stack-sm">
            <div className="step-badge">Step 4</div>
            <h2 className="section-title">名称と位置情報</h2>
            <p className="section-copy">
              ピンは地図の中央に固定されています。地図をズーム・移動して中央を壁の位置に合わせてください。
            </p>
          </div>
        </div>

        <div className="field-grid field-grid--two" style={{ marginBottom: 16 }}>
          <label className="field-label">
            壁の名称
            <input
              onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
              placeholder="例: Tokyo Station Demo Wall"
              value={values.name}
            />
          </label>

          <div className="notice">
            位置情報は壁の近くを示す目印です。最終的には地図中央の固定ピン位置で保存されます。
          </div>
        </div>

        <div className="field-grid field-grid--two" style={{ marginBottom: 16 }}>
          <label className="field-label">
            緯度
            <input
              inputMode="decimal"
              onChange={(event) =>
                setValues((current) => ({ ...current, latitude: event.target.value }))
              }
              placeholder="35.680959"
              value={values.latitude}
            />
          </label>
          <label className="field-label">
            経度
            <input
              inputMode="decimal"
              onChange={(event) =>
                setValues((current) => ({ ...current, longitude: event.target.value }))
              }
              placeholder="139.767307"
              value={values.longitude}
            />
          </label>
        </div>

        <LocationPicker
          mapTilerKey={mapTilerKey}
          onChange={(nextLocation) =>
            setValues((current) => ({
              ...current,
              latitude: formatCoordinate(nextLocation.latitude),
              longitude: formatCoordinate(nextLocation.longitude),
            }))
          }
          value={
            latitude !== null && longitude !== null
              ? {
                  latitude,
                  longitude,
                }
              : null
          }
        />
      </section>

      <section className="section-card">
        <div className="section-topline">
          <div className="stack-sm">
            <div className="step-badge">Finish</div>
            <h2 className="section-title">登録内容を送信</h2>
            <p className="section-copy">
              API には既存の <span className="mono">POST /api/walls</span> を使い、フロント側で整えた
              3種類の画像を multipart で送ります。rectified は Step 2 で確定したものを使います。
            </p>
          </div>
        </div>

        <div className="info-grid" style={{ marginBottom: 16 }}>
          <div className="metric-pill">
            <strong>Original</strong>
            <span>JPEG / 長辺 3840px 以内</span>
          </div>
          <div className="metric-pill">
            <strong>Thumbnail</strong>
            <span>800 x 800px</span>
          </div>
          <div className="metric-pill">
            <strong>Rectified</strong>
            <span>
              {rectifiedPreview
                ? `${rectifiedPreview.width} x ${rectifiedPreview.height}px`
                : 'Step 2 で生成'}
            </span>
          </div>
        </div>

        <div className="inline-actions">
          <button className="button button-primary" disabled={!canSubmit} type="submit">
            {submitPhase ? '送信中…' : '壁を登録する'}
          </button>
          <Link className="button button-secondary" href="/">
            一覧へ戻る
          </Link>
        </div>
      </section>
    </form>
  );
}
