"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import {
  CANVAS_MAX_SIZE,
  DEFAULT_CANVAS_SIZE,
  type CornerCoordinate,
  type CreateWallResponse,
} from "@street-art/shared";
import { CornerEditor } from "./CornerEditor";
import { LocationPicker } from "./LocationPicker";
import { WallScanner, type ScannedWallCapture } from "./WallScanner";
import {
  buildAspectAdjustedRectifiedImageAsset,
  buildRectifiedImageAsset,
  buildWallImageFiles,
  inspectWallImage,
  prepareWallImageFile,
  type RectifiedImageAsset,
  WALL_IMAGE_INPUT_ACCEPT,
} from "../../lib/wall-image";
import {
  CANVAS_MIN_SIZE,
  clamp,
  formatCoordinate,
  getCanvasDimensions,
  getDefaultCornerCoordinates,
  serializeCornerCoordinates,
} from "../../lib/walls";
import { AppHeader } from "../AppHeader";
import { ConfirmationDialog } from "../ConfirmationDialog";

const ASPECT_RATIO_MIN = 1 / 3;
const ASPECT_RATIO_MAX = 3;
const ASPECT_RATIO_SLIDER_MIN = 0;
const ASPECT_RATIO_SLIDER_MAX = 100;
const MAX_ORIGINAL_LONG_EDGE = 3840;

type RegistrationMethod = "scan" | "upload";
type WallStep =
  | "method"
  | "scan"
  | "upload"
  | "region"
  | "aspect"
  | "canvas"
  | "details"
  | "review";

type SelectedImage = {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  willDownscaleOriginal: boolean;
  source: RegistrationMethod;
};

type RectifiedPreview = RectifiedImageAsset & {
  previewUrl: string;
};

type WallFormValues = {
  name: string;
  latitude: string;
  longitude: string;
};

type NewWallRegistrationFormProps = {
  mapTilerKey: string;
};

type StepNavigationProps = {
  backLabel?: string;
  children?: ReactNode;
  hideNext?: boolean;
  nextBusy?: boolean;
  nextDisabled?: boolean;
  nextLabel?: string;
  onNext?: () => void | Promise<void>;
};

const initialValues: WallFormValues = {
  name: "",
  latitude: "",
  longitude: "",
};

function parseCoordinate(value: string, min: number, max: number) {
  if (value.trim() === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return null;
  }

  return parsed;
}

function extractErrorMessages(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return ["壁の登録に失敗しました。"];
  }

  const messages: string[] = [];

  if ("errors" in payload && Array.isArray(payload.errors)) {
    for (const error of payload.errors) {
      if (
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof error.message === "string"
      ) {
        messages.push(error.message);
      }
    }
  }

  if ("message" in payload && typeof payload.message === "string") {
    messages.push(payload.message);
  }

  return messages.length > 0 ? messages : ["壁の登録に失敗しました。"];
}

function getStepFlow(method: RegistrationMethod | null): WallStep[] {
  if (method === "scan") {
    return ["method", "scan", "region", "canvas", "details", "review"];
  }

  if (method === "upload") {
    return [
      "method",
      "upload",
      "region",
      "aspect",
      "canvas",
      "details",
      "review",
    ];
  }

  return ["method"];
}

function formatAspectRatio(aspectRatio: number) {
  if (aspectRatio >= 1) {
    return `${aspectRatio.toFixed(2)}:1`;
  }

  return `1:${(1 / aspectRatio).toFixed(2)}`;
}

function getAspectRatioFromSliderValue(sliderValue: number) {
  const safeSliderValue = clamp(
    sliderValue,
    ASPECT_RATIO_SLIDER_MIN,
    ASPECT_RATIO_SLIDER_MAX,
  );
  const progress =
    (safeSliderValue - ASPECT_RATIO_SLIDER_MIN) /
    (ASPECT_RATIO_SLIDER_MAX - ASPECT_RATIO_SLIDER_MIN);
  const logMin = Math.log(ASPECT_RATIO_MIN);
  const logMax = Math.log(ASPECT_RATIO_MAX);

  return Math.exp(logMin + (logMax - logMin) * progress);
}

function getAspectRatioSliderValue(aspectRatio: number) {
  const safeAspectRatio = clamp(
    aspectRatio,
    ASPECT_RATIO_MIN,
    ASPECT_RATIO_MAX,
  );
  const logMin = Math.log(ASPECT_RATIO_MIN);
  const logMax = Math.log(ASPECT_RATIO_MAX);
  const progress = (Math.log(safeAspectRatio) - logMin) / (logMax - logMin);

  return (
    ASPECT_RATIO_SLIDER_MIN +
    (ASPECT_RATIO_SLIDER_MAX - ASPECT_RATIO_SLIDER_MIN) * progress
  );
}

function getAspectPreviewFrame(aspectRatio: number) {
  const safeAspectRatio =
    Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;

  if (safeAspectRatio >= 1) {
    return {
      widthPercent: 100,
      heightPercent: Math.max(1, Math.min(100, (1 / safeAspectRatio) * 100)),
    };
  }

  return {
    widthPercent: Math.max(1, Math.min(100, safeAspectRatio * 100)),
    heightPercent: 100,
  };
}

function StepNavigation({
  backLabel = "戻る",
  children,
  hideNext = false,
  nextBusy = false,
  nextDisabled = false,
  nextLabel = "次に進む",
  onNext,
}: StepNavigationProps) {
  return (
    <div className="step-navigation">
      <div>
        {children}
        {hideNext ? null : (
          <button
            className="button button-primary w-full justify-center"
            disabled={nextDisabled || nextBusy}
            onClick={() => void onNext?.()}
            type="button"
          >
            {nextBusy ? "処理中…" : nextLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export function NewWallRegistrationForm({
  mapTilerKey,
}: NewWallRegistrationFormProps) {
  const router = useRouter();
  const [method, setMethod] = useState<RegistrationMethod | null>(null);
  const [step, setStep] = useState<WallStep>("method");
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(
    null,
  );
  const [rectifiedPreview, setRectifiedPreview] =
    useState<RectifiedPreview | null>(null);
  const [aspectAdjustedPreview, setAspectAdjustedPreview] =
    useState<RectifiedPreview | null>(null);
  const [corners, setCorners] = useState<CornerCoordinate[]>(
    getDefaultCornerCoordinates(1200, 800),
  );
  const [canvasLongSide, setCanvasLongSide] = useState(DEFAULT_CANVAS_SIZE);
  const [aspectRatioValue, setAspectRatioValue] = useState(1);
  const [values, setValues] = useState<WallFormValues>(initialValues);
  const [uploadIssues, setUploadIssues] = useState<string[]>([]);
  const [registrationTopMessage, setRegistrationTopMessage] = useState<
    string | null
  >(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [rectifyPhase, setRectifyPhase] = useState<string | null>(null);
  const [aspectPhase, setAspectPhase] = useState<string | null>(null);
  const [submitPhase, setSubmitPhase] = useState<string | null>(null);
  const [scanLocationMessage, setScanLocationMessage] = useState<string | null>(
    null,
  );
  const [success, setSuccess] = useState<CreateWallResponse | null>(null);
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false);

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

  useEffect(() => {
    if (!aspectAdjustedPreview) {
      return;
    }

    return () => {
      URL.revokeObjectURL(aspectAdjustedPreview.previewUrl);
    };
  }, [aspectAdjustedPreview]);

  const effectiveRectifiedPreview =
    method === "upload"
      ? (aspectAdjustedPreview ?? rectifiedPreview)
      : rectifiedPreview;
  const canvasAspectRatio = effectiveRectifiedPreview?.aspectRatio ?? 1;
  const canvasDimensions = getCanvasDimensions(
    canvasLongSide,
    canvasAspectRatio,
  );
  const aspectRatioSliderValue = getAspectRatioSliderValue(aspectRatioValue);
  const aspectPreviewFrame = getAspectPreviewFrame(aspectRatioValue);
  const latitude = parseCoordinate(values.latitude, -90, 90);
  const longitude = parseCoordinate(values.longitude, -180, 180);
  const stepFlow = getStepFlow(method);
  const currentStepIndex = Math.max(0, stepFlow.indexOf(step));
  const totalSteps = stepFlow.length;
  const hasDeterminateProgress = method !== null && totalSteps > 1;
  const progressPercent = hasDeterminateProgress
    ? (currentStepIndex / (totalSteps - 1)) * 100
    : 0;
  const progressStatus = hasDeterminateProgress
    ? `${currentStepIndex + 1} / ${totalSteps}`
    : "開始";
  const progressDescription = hasDeterminateProgress
    ? `全${totalSteps}ステップ中${currentStepIndex + 1}ステップ目`
    : "登録方法を選択";
  const canSubmit =
    Boolean(selectedImage) &&
    Boolean(effectiveRectifiedPreview) &&
    values.name.trim().length > 0 &&
    latitude !== null &&
    longitude !== null &&
    !rectifyPhase &&
    !aspectPhase &&
    !submitPhase;

  function resetImagePipeline() {
    setSelectedImage(null);
    setRectifiedPreview(null);
    setAspectAdjustedPreview(null);
    setCorners(getDefaultCornerCoordinates(1200, 800));
    setCanvasLongSide(DEFAULT_CANVAS_SIZE);
    setAspectRatioValue(1);
    setUploadIssues([]);
    setMessages([]);
    setRectifyPhase(null);
    setAspectPhase(null);
    setSubmitPhase(null);
    setScanLocationMessage(null);
  }

  function beginRegistration(nextMethod: RegistrationMethod) {
    resetImagePipeline();
    setRegistrationTopMessage(null);
    setMethod(nextMethod);
    setStep(nextMethod);
    setSuccess(null);
    setValues(initialValues);
  }

  function returnToRegistrationTop(message: string) {
    resetImagePipeline();
    setRegistrationTopMessage(message);
    setMethod(null);
    setStep("method");
    setSuccess(null);
    setValues(initialValues);

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function goBack() {
    const previousStep = stepFlow[currentStepIndex - 1];

    setMessages([]);

    if (previousStep) {
      setStep(previousStep);
    }
  }

  function goToNextStep() {
    const nextStep = stepFlow[currentStepIndex + 1];

    if (nextStep) {
      setStep(nextStep);
    }
  }

  function leaveRegistration() {
    router.push("/walls");
  }

  function handleHeaderBack() {
    if (success) {
      leaveRegistration();
      return;
    }

    if (currentStepIndex > 0) {
      goBack();
      return;
    }

    leaveRegistration();
  }

  function handleDiscardRegistration() {
    setIsDiscardDialogOpen(false);
    leaveRegistration();
  }

  async function handleNext() {
    setMessages([]);

    if (step === "upload" && !selectedImage) {
      setMessages(["壁画像をアップロードしてください。"]);
      return;
    }

    if (step === "region" && !rectifiedPreview) {
      setMessages(["キャンバス範囲を確定してください。"]);
      return;
    }

    if (step === "aspect") {
      const confirmed = await confirmAspectRatio();

      if (!confirmed) {
        return;
      }
    }

    if (step === "details") {
      if (values.name.trim().length === 0) {
        setMessages(["壁の名称を入力してください。"]);
        return;
      }

      if (latitude === null || longitude === null) {
        setMessages(["緯度・経度を正しく入力してください。"]);
        return;
      }
    }

    goToNextStep();
  }

  async function handleImageSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setMessages([]);
    setUploadIssues([]);
    setSuccess(null);
    setRectifyPhase(null);
    setAspectPhase(null);
    setSubmitPhase(null);
    setRectifiedPreview(null);
    setAspectAdjustedPreview(null);
    setScanLocationMessage(null);

    try {
      const preparedImage = await prepareWallImageFile(file);
      const inspection = await inspectWallImage(preparedImage.file, {
        originalFileSize: preparedImage.originalFileSize,
      });

      if (inspection.errors.length > 0) {
        setSelectedImage(null);
        setCorners(getDefaultCornerCoordinates(1200, 800));
        setUploadIssues([
          ...inspection.errors,
          "別のファイルをアップロードしてください。",
        ]);
        event.currentTarget.value = "";
        return;
      }

      const nextPreviewUrl = URL.createObjectURL(preparedImage.file);
      setSelectedImage({
        file: preparedImage.file,
        previewUrl: nextPreviewUrl,
        source: "upload",
        width: inspection.metadata.width,
        height: inspection.metadata.height,
        willDownscaleOriginal: inspection.metadata.willDownscaleOriginal,
      });
      setCorners(
        getDefaultCornerCoordinates(
          inspection.metadata.width,
          inspection.metadata.height,
        ),
      );
      setCanvasLongSide(DEFAULT_CANVAS_SIZE);
      setAspectRatioValue(inspection.metadata.aspectRatio);
    } catch (error) {
      setSelectedImage(null);
      setUploadIssues([
        error instanceof Error
          ? error.message
          : "画像の読み込みに失敗しました。",
        "別のファイルをアップロードしてください。",
      ]);
      event.currentTarget.value = "";
    }
  }

  function fillLocationFromScan() {
    if (!navigator.geolocation) {
      setScanLocationMessage(
        "位置情報を取得できませんでした。緯度・経度を入力してください。",
      );
      return;
    }

    setScanLocationMessage("スキャン完了時の位置情報を取得しています。");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setValues((current) => ({
          ...current,
          latitude: formatCoordinate(position.coords.latitude),
          longitude: formatCoordinate(position.coords.longitude),
        }));
        setScanLocationMessage("スキャン完了時の位置情報を自動入力しました。");
      },
      () => {
        setScanLocationMessage(
          "位置情報を取得できませんでした。緯度・経度を入力してください。",
        );
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      },
    );
  }

  function handleScanCapture(capture: ScannedWallCapture) {
    const nextPreviewUrl = URL.createObjectURL(capture.file);

    setMethod("scan");
    setMessages([]);
    setUploadIssues([]);
    setSuccess(null);
    setRectifyPhase(null);
    setAspectPhase(null);
    setSubmitPhase(null);
    setRectifiedPreview(null);
    setAspectAdjustedPreview(null);
    setSelectedImage({
      file: capture.file,
      previewUrl: nextPreviewUrl,
      source: "scan",
      width: capture.width,
      height: capture.height,
      willDownscaleOriginal:
        Math.max(capture.width, capture.height) > MAX_ORIGINAL_LONG_EDGE,
    });
    setCorners(capture.corners);
    setCanvasLongSide(DEFAULT_CANVAS_SIZE);
    setAspectRatioValue(capture.width / capture.height);
    setStep("region");
    fillLocationFromScan();
  }

  function handleCornerChange(nextCorners: CornerCoordinate[]) {
    setCorners(nextCorners);

    if (rectifiedPreview) {
      setRectifiedPreview(null);
    }

    if (aspectAdjustedPreview) {
      setAspectAdjustedPreview(null);
    }
  }

  async function handleGenerateRectified() {
    if (!selectedImage) {
      setMessages(["先に壁画像を用意してください。"]);
      return;
    }

    setMessages([]);
    setAspectAdjustedPreview(null);
    setRectifyPhase("画像を補正しています。");

    try {
      const nextRectifiedAsset = await buildRectifiedImageAsset({
        file: selectedImage.file,
        corners,
      });

      setRectifiedPreview({
        ...nextRectifiedAsset,
        previewUrl: URL.createObjectURL(nextRectifiedAsset.rectifiedImageFile),
      });
      setAspectRatioValue(
        clamp(
          nextRectifiedAsset.aspectRatio,
          ASPECT_RATIO_MIN,
          ASPECT_RATIO_MAX,
        ),
      );
      setRectifyPhase(null);
    } catch (error) {
      setMessages([
        error instanceof Error
          ? error.message
          : "rectified の生成に失敗しました。",
      ]);
      setRectifyPhase(null);
    }
  }

  function handleAspectRatioChange(nextValue: number) {
    setAspectRatioValue(clamp(nextValue, ASPECT_RATIO_MIN, ASPECT_RATIO_MAX));
    setAspectAdjustedPreview(null);
  }

  async function confirmAspectRatio() {
    if (!rectifiedPreview) {
      setMessages(["先に範囲を確定し、傾きを補正してください。"]);
      return false;
    }

    if (
      aspectAdjustedPreview &&
      Math.abs(aspectAdjustedPreview.aspectRatio - aspectRatioValue) < 0.01
    ) {
      return true;
    }

    if (Math.abs(rectifiedPreview.aspectRatio - aspectRatioValue) < 0.005) {
      setAspectAdjustedPreview(null);
      return true;
    }

    setAspectPhase("調整後の rectified を生成しています。");

    try {
      const nextAdjustedAsset = await buildAspectAdjustedRectifiedImageAsset({
        aspectRatio: aspectRatioValue,
        file: rectifiedPreview.rectifiedImageFile,
      });

      setAspectAdjustedPreview({
        ...nextAdjustedAsset,
        previewUrl: URL.createObjectURL(nextAdjustedAsset.rectifiedImageFile),
      });
      setAspectPhase(null);
      return true;
    } catch (error) {
      setMessages([
        error instanceof Error
          ? error.message
          : "アスペクト比の調整に失敗しました。",
      ]);
      setAspectPhase(null);
      return false;
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (step !== "review") {
      return;
    }

    if (!selectedImage) {
      setMessages(["壁画像を用意してください。"]);
      return;
    }

    if (!effectiveRectifiedPreview) {
      setMessages(["範囲を確定してください。"]);
      return;
    }

    if (latitude === null || longitude === null) {
      setMessages(["緯度・経度を正しく入力してください。"]);
      return;
    }

    setMessages([]);
    setSuccess(null);
    setSubmitPhase("Original と Thumbnail を生成しています。");

    try {
      const processedImages = await buildWallImageFiles({
        file: selectedImage.file,
        rectifiedImageFile: effectiveRectifiedPreview.rectifiedImageFile,
      });

      const formData = new FormData();
      formData.set("name", values.name.trim());
      formData.set("latitude", String(latitude));
      formData.set("longitude", String(longitude));
      formData.set("canvasWidth", String(canvasDimensions.width));
      formData.set("canvasHeight", String(canvasDimensions.height));
      formData.set(
        "cornerCoordinates",
        JSON.stringify(serializeCornerCoordinates(corners)),
      );
      formData.set(
        "originalImageFile",
        processedImages.originalImageFile,
        processedImages.originalImageFile.name,
      );
      formData.set(
        "thumbnailImageFile",
        processedImages.thumbnailImageFile,
        processedImages.thumbnailImageFile.name,
      );
      formData.set(
        "rectifiedImageFile",
        processedImages.rectifiedImageFile,
        processedImages.rectifiedImageFile.name,
      );

      setSubmitPhase("API に送信しています。");

      const response = await fetch("/api/walls", {
        method: "POST",
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
        error instanceof Error
          ? error.message
          : "画像処理またはアップロードに失敗しました。",
      ]);
      setSubmitPhase(null);
    }
  }

  const renderProgress = () => (
    <div className="overflow-hidden h-1" aria-label="登録の進捗" role="group">
      <div
        className="h-1 transition-all duration-200 bg-background-strong"
        aria-hidden="true"
      >
        <div
          className="h-full bg-primary"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );

  const renderMethodStep = () => (
    <>
      <div className="section-topline">
        <div className="stack-sm">
          <h2 className="section-title text-2xl font-bold">登録方法を選択</h2>
          <p className="section-copy">
            カメラで壁面をスキャンするか、手元の画像をアップロードして登録します。
          </p>
        </div>
      </div>
      {registrationTopMessage ? (
        <div className="error-banner" style={{ marginBottom: 16 }}>
          <strong>{registrationTopMessage}</strong>
          <div>スキャンを開始できないため、登録方法の選択画面に戻しました。</div>
        </div>
      ) : null}
      <div className="registration-method-grid">
        <button
          className="method-button h-40"
          onClick={() => beginRegistration("scan")}
          type="button"
        >
          <svg
            aria-hidden="true"
            className="method-button__icon"
            viewBox="0 0 24 24"
          >
            <path d="M4 7.5h3.1L8.7 5h6.6l1.6 2.5H20a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2Zm8 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0-1.6a1.9 1.9 0 1 1 0-3.8 1.9 1.9 0 0 1 0 3.8Z" />
          </svg>
          <span>
            <strong>スキャンで登録</strong>
            <small>カメラで壁を正面から手動撮影します。</small>
          </span>
        </button>

        <button
          className="method-button"
          onClick={() => beginRegistration("upload")}
          type="button"
        >
          <svg
            aria-hidden="true"
            className="method-button__icon"
            viewBox="0 0 24 24"
          >
            <path d="M11 16.2V7.6l-3 3-1.4-1.4L12 3.8l5.4 5.4-1.4 1.4-3-3v8.6h-2ZM5 20.2a3 3 0 0 1-3-3v-2.4h2v2.4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2.4h2v2.4a3 3 0 0 1-3 3H5Z" />
          </svg>
          <span>
            <strong>画像をアップロードして登録</strong>
            <small>既存の画像補正フローを使います。</small>
          </span>
        </button>
      </div>
    </>
  );

  const renderUploadStep = () => (
    <>
      <div className="section-topline">
        <div className="stack-sm">
          <h2 className="section-title text-2xl font-bold">
            写真をアップロード
          </h2>
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
            <span>
              {selectedImage.willDownscaleOriginal
                ? "3840px 以内へ縮小"
                : "そのまま JPEG 化"}
            </span>
          </div>
          <div className="metric-pill">
            <strong>Thumbnail</strong>
            <span>800 x 800px</span>
          </div>
        </div>
      ) : null}

      <StepNavigation nextDisabled={!selectedImage} onNext={handleNext} />
    </>
  );

  const renderScanStep = () => (
    <>
      <div className="section-topline">
        <div className="stack-sm">
          <h2 className="section-title text-2xl font-bold">壁面を撮影</h2>
          <p className="section-copy">壁全体を、正面から撮影してください。</p>
        </div>
      </div>

      <WallScanner
        onCapture={handleScanCapture}
        onResolutionInsufficient={() =>
          returnToRegistrationTop("カメラの解像度が足りません")
        }
      />

      <StepNavigation hideNext />
    </>
  );

  const renderRegionStep = () => (
    <>
      <div className="section-topline">
        <div className="stack-sm">
          <h2 className="section-title text-2xl font-bold">
            キャンバス範囲を選択
          </h2>
          <p className="section-copy">
            キャンバス範囲の四隅を選択してください。
          </p>
        </div>
      </div>

      {selectedImage ? (
        <div className="stack-md">
          <CornerEditor
            imageAlt={
              selectedImage.source === "scan"
                ? "スキャンした壁画像"
                : "アップロードした壁画像"
            }
            imageHeight={selectedImage.height}
            imageUrl={selectedImage.previewUrl}
            imageWidth={selectedImage.width}
            onChange={handleCornerChange}
            value={corners}
          />

          <div className="inline-actions">
            {!rectifiedPreview && (
              <button
                className="button button-primary w-full justify-center"
                disabled={Boolean(rectifyPhase)}
                onClick={handleGenerateRectified}
                type="button"
              >
                {rectifyPhase
                  ? "補正中…"
                  : rectifiedPreview
                    ? "補正完了"
                    : "範囲を確定"}
              </button>
            )}
          </div>

          {rectifyPhase ? <div className="notice">{rectifyPhase}</div> : null}

          {rectifiedPreview ? (
            <div className="preview-frame">
              <div className="overflow-hidden bg-background">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="w-full"
                  src={rectifiedPreview.previewUrl}
                  alt="補正済み画像プレビュー"
                />
              </div>
              <div className="notice">補正が完了しました。</div>
            </div>
          ) : (
            <div className="notice">
              四隅を選択し、「範囲を確定」を押してください。
            </div>
          )}
        </div>
      ) : (
        <div className="empty-state">先に壁画像を用意してください。</div>
      )}

      <StepNavigation
        nextDisabled={!rectifiedPreview || Boolean(rectifyPhase)}
        onNext={handleNext}
      />
    </>
  );

  const renderAspectStep = () => (
    <>
      <div className="section-topline">
        <div className="stack-sm">
          <h2 className="section-title text-2xl font-bold">
            アスペクト比を調整
          </h2>
          <p className="section-copy">
            射影変換だけでは復元しきれない元の比率を、1:3 から 3:1
            の範囲で補正します。
          </p>
        </div>
        <div className="metric-pill">
          <strong>現在</strong>
          <span>{formatAspectRatio(aspectRatioValue)}</span>
        </div>
      </div>

      {rectifiedPreview ? (
        <div className="aspect-adjuster">
          <div className="aspect-preview-shell">
            <div className="aspect-preview-stage">
              <div
                className="aspect-preview"
                style={{
                  width: `${aspectPreviewFrame.widthPercent}%`,
                  height: `${aspectPreviewFrame.heightPercent}%`,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="aspect-preview__image"
                  src={rectifiedPreview.previewUrl}
                  alt="比率調整中の rectified プレビュー"
                />
              </div>
            </div>
          </div>

          <div className="stack-md">
            <label className="">
              比率 {formatAspectRatio(aspectRatioValue)}
              <input
                className="range-input"
                max={ASPECT_RATIO_SLIDER_MAX}
                min={ASPECT_RATIO_SLIDER_MIN}
                onChange={(event) =>
                  handleAspectRatioChange(
                    getAspectRatioFromSliderValue(Number(event.target.value)),
                  )
                }
                step="0.1"
                type="range"
                value={aspectRatioSliderValue}
              />
            </label>
            <div className="range-labels" aria-hidden="true">
              <span>{formatAspectRatio(ASPECT_RATIO_MIN)}</span>
              <span>1.00:1</span>
              <span>{formatAspectRatio(ASPECT_RATIO_MAX)}</span>
            </div>

            <div className="inline-actions">
              <button
                className="button button-secondary"
                onClick={() =>
                  handleAspectRatioChange(rectifiedPreview.aspectRatio)
                }
                type="button"
              >
                生成時の比率へ戻す
              </button>
              <div className="metric-pill">
                <strong>生成時</strong>
                <span>{formatAspectRatio(rectifiedPreview.aspectRatio)}</span>
              </div>
            </div>

            {aspectPhase ? <div className="notice">{aspectPhase}</div> : null}
            {aspectAdjustedPreview ? (
              <div className="notice">
                調整後の rectified を生成しました。
                {aspectAdjustedPreview.width} x {aspectAdjustedPreview.height}px
                を次のステップで使います。
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="empty-state">先に rectified を生成してください。</div>
      )}

      <StepNavigation
        nextBusy={Boolean(aspectPhase)}
        nextDisabled={!rectifiedPreview}
        onNext={handleNext}
      />
    </>
  );

  const renderCanvasStep = () => (
    <>
      <div className="section-topline">
        <div className="stack-sm">
          <h2 className="section-title text-2xl font-bold">
            キャンバスサイズを指定
          </h2>
          <p className="section-copy">
            スライダーで、キャンバスのピクセル数を指定してください。
          </p>
        </div>
        <Link
          className="button button-secondary"
          href="/canvas-size-guide"
          target="_blank"
        >
          サイズガイドを開く
        </Link>
      </div>

      {effectiveRectifiedPreview ? (
        <div className="stack-md">
          <label className="field-label">
            長辺 {canvasLongSide}px
            <input
              className="range-input"
              max={CANVAS_MAX_SIZE}
              min={CANVAS_MIN_SIZE}
              onChange={(event) =>
                setCanvasLongSide(Number(event.target.value))
              }
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
                  ? "横長"
                  : canvasDimensions.width === canvasDimensions.height
                    ? "正方形"
                    : "縦長"}
              </span>
            </div>
            <div className="metric-pill">
              <strong>Rectified 基準</strong>
              <span>
                {effectiveRectifiedPreview.width} x{" "}
                {effectiveRectifiedPreview.height}px
              </span>
            </div>
          </div>

          <div className="preview-frame">
            <div className="preview-image">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={effectiveRectifiedPreview.previewUrl}
                alt="rectified プレビュー"
              />
            </div>
            <div className="canvas-proportion">
              <div
                className="canvas-proportion__shape"
                style={{
                  aspectRatio: `${canvasDimensions.width} / ${canvasDimensions.height}`,
                }}
              >
                {canvasDimensions.width} x {canvasDimensions.height}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="empty-state">先に rectified を生成してください。</div>
      )}

      <StepNavigation
        nextDisabled={!effectiveRectifiedPreview}
        onNext={handleNext}
      />
    </>
  );

  const renderDetailsStep = () => (
    <>
      <div className="section-topline">
        <div className="stack-sm">
          <h2 className="section-title text-2xl font-bold">名称と位置情報</h2>
          <p className="section-copy">
            壁の名前と位置を設定します。スキャンで登録した場合は、撮影完了時の位置情報を自動入力します。
          </p>
        </div>
      </div>

      {scanLocationMessage ? (
        <div className="notice">{scanLocationMessage}</div>
      ) : null}

      <div className="field-grid field-grid--two" style={{ marginBottom: 16 }}>
        <label className="field-label">
          壁の名称
          <input
            onChange={(event) =>
              setValues((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="例: Tokyo Station Demo Wall"
            value={values.name}
          />
        </label>

        <div className="notice">
          位置情報は壁の近くを示す目印です。最終的には地図中央の固定ピン位置で保存されます。
        </div>
      </div>

      <input
        type="hidden"
        inputMode="decimal"
        onChange={(event) =>
          setValues((current) => ({
            ...current,
            latitude: event.target.value,
          }))
        }
        placeholder="35.680959"
        value={values.latitude}
      />

      <input
        type="hidden"
        inputMode="decimal"
        onChange={(event) =>
          setValues((current) => ({
            ...current,
            longitude: event.target.value,
          }))
        }
        placeholder="139.767307"
        value={values.longitude}
      />

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

      <StepNavigation
        nextDisabled={
          values.name.trim().length === 0 ||
          latitude === null ||
          longitude === null
        }
        nextLabel="内容確認へ"
        onNext={handleNext}
      />
    </>
  );

  const renderReviewStep = () => (
    <>
      <div className="section-topline">
        <div className="stack-sm">
          <h2 className="section-title text-2xl font-bold">登録内容を送信</h2>
          <p className="section-copy">
            API には既存の <span className="mono">POST /api/walls</span>{" "}
            を使い、フロント側で整えた 3種類の画像を multipart で送ります。
          </p>
        </div>
      </div>

      <div className="info-grid" style={{ marginBottom: 16 }}>
        <div className="metric-pill">
          <strong>登録方法</strong>
          <span>{method === "scan" ? "スキャン" : "画像アップロード"}</span>
        </div>
        <div className="metric-pill">
          <strong>壁名</strong>
          <span>{values.name.trim()}</span>
        </div>
        <div className="metric-pill">
          <strong>位置</strong>
          <span>
            {latitude !== null && longitude !== null
              ? `${formatCoordinate(latitude)}, ${formatCoordinate(longitude)}`
              : "未設定"}
          </span>
        </div>
        <div className="metric-pill">
          <strong>Canvas</strong>
          <span>
            {canvasDimensions.width} x {canvasDimensions.height}px
          </span>
        </div>
        <div className="metric-pill">
          <strong>Rectified</strong>
          <span>
            {effectiveRectifiedPreview
              ? `${effectiveRectifiedPreview.width} x ${effectiveRectifiedPreview.height}px`
              : "未生成"}
          </span>
        </div>
      </div>

      {submitPhase ? <div className="notice">{submitPhase}</div> : null}

      <div className="step-navigation">
        <button
          className="button button-secondary"
          onClick={goBack}
          type="button"
        >
          戻る
        </button>
        <div className="inline-actions">
          <button
            className="button button-primary"
            disabled={!canSubmit}
            type="submit"
          >
            {submitPhase ? "送信中…" : "壁を登録する"}
          </button>
          <Link className="button button-secondary" href="/">
            一覧へ戻る
          </Link>
        </div>
      </div>
    </>
  );

  return (
    <>
      <AppHeader
        leading={
          <button
            aria-label={
              success || currentStepIndex === 0
                ? "カベへ戻る"
                : "前のステップへ戻る"
            }
            className="site-header__control site-header__control--icon"
            onClick={handleHeaderBack}
            type="button"
          >
            <ArrowLeft aria-hidden="true" size={22} weight="bold" />
          </button>
        }
        title={<div className="site-header__title">新規壁登録</div>}
        trailing={
          success ? null : (
            <button
              className="site-header__control site-header__control--text"
              onClick={() => setIsDiscardDialogOpen(true)}
              type="button"
            >
              キャンセル
            </button>
          )
        }
      />
      {renderProgress()}
      <form className="new-wall-registration-form" onSubmit={handleSubmit}>
        {success ? (
          <div className="success-banner">
            <strong>{success.name} を登録しました。</strong>
            <div className="stack-sm" style={{ marginTop: 8 }}>
              <div>
                キャンバスサイズ: {success.canvas?.width} x{" "}
                {success.canvas?.height}px
              </div>
              <div className="mono">Wall ID: {success.id}</div>
              <div className="inline-actions">
                <Link
                  className="button button-primary"
                  href={`/walls/${success.id}`}
                >
                  壁詳細へ
                </Link>
                <Link className="button button-secondary" href="/">
                  壁一覧へ戻る
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <>
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

            {step === "method" ? renderMethodStep() : null}
            {step === "scan" ? renderScanStep() : null}
            {step === "upload" ? renderUploadStep() : null}
            {step === "region" ? renderRegionStep() : null}
            {step === "aspect" ? renderAspectStep() : null}
            {step === "canvas" ? renderCanvasStep() : null}
            {step === "details" ? renderDetailsStep() : null}
            {step === "review" ? renderReviewStep() : null}
          </>
        )}
      </form>
      <ConfirmationDialog
        cancelLabel="キャンセル"
        confirmLabel="破棄"
        confirmTone="destructive"
        description="ここまで入力した内容は保存されません。新規壁登録を中止してカベ画面へ戻ります。"
        onCancel={() => setIsDiscardDialogOpen(false)}
        onConfirm={handleDiscardRegistration}
        open={isDiscardDialogOpen}
        title="入力内容を破棄しますか？"
      />
    </>
  );
}
