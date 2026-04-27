"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowCounterClockwiseIcon,
  ArrowLeft,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import {
  CANVAS_MAX_SIZE,
  DEFAULT_CANVAS_SIZE,
  type CornerCoordinate,
  type CreateWallResponse,
} from "@street-art/shared";
import { CornerEditor } from "./CornerEditor";
import {
  LocationPicker,
  LocationPreviewMap,
  type LocationValue,
} from "./LocationPicker";
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
import { Spinner } from "../Spinner";

const ASPECT_RATIO_MIN = 1 / 3;
const ASPECT_RATIO_MAX = 3;
const ASPECT_RATIO_SLIDER_MIN = 0;
const ASPECT_RATIO_SLIDER_MAX = 100;
const MAX_ORIGINAL_LONG_EDGE = 3840;
const PIXEL_NUMBER_FORMATTER = new Intl.NumberFormat("ja-JP");

type RegistrationMethod = "scan" | "upload";
type WallStep =
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
  displayAddress: string;
};

type MapTilerReverseGeocodingResponse = {
  features?: Array<{
    place_name?: string;
  }>;
};

type NewWallRegistrationFormProps = {
  mapTilerKey: string;
  registrationMethod: RegistrationMethod;
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
  displayAddress: "",
};

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

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

function areLocationsEqual(
  first: LocationValue | null,
  second: LocationValue | null,
) {
  if (!first || !second) {
    return first === second;
  }

  return (
    Math.abs(first.latitude - second.latitude) <= 0.000001 &&
    Math.abs(first.longitude - second.longitude) <= 0.000001
  );
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

function getStepFlow(method: RegistrationMethod): WallStep[] {
  if (method === "scan") {
    return ["scan", "region", "canvas", "details", "review"];
  }

  return ["upload", "region", "aspect", "canvas", "details", "review"];
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

function formatPixelMeasure(value: number) {
  return `${PIXEL_NUMBER_FORMATTER.format(value)} px`;
}

function formatPixelCount(value: number) {
  return `${PIXEL_NUMBER_FORMATTER.format(value)} ピクセル`;
}

function cleanReverseGeocodedAddressSegment(segment: string) {
  return segment
    .replace(/〒?\s*\d{3}-\d{4}/g, " ")
    .replace(/(^|\s)Japan(?=\s|$)/gi, " ")
    .replace(/(^|\s)日本(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatReverseGeocodedDisplayAddress(address: string) {
  const normalizedAddress = address.trim();

  if (normalizedAddress.length === 0) {
    return "";
  }

  const segments = normalizedAddress
    .split(/[、,]/)
    .map(cleanReverseGeocodedAddressSegment)
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return cleanReverseGeocodedAddressSegment(normalizedAddress);
  }

  return [...segments].reverse().join("");
}

type CanvasSizePreviewProps = {
  aspectRatio: number;
  imageUrl: string;
  width: number;
  height: number;
};

function CanvasSizePreview({
  aspectRatio,
  imageUrl,
  width,
  height,
}: CanvasSizePreviewProps) {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const pixelCount = safeWidth * safeHeight;
  const safeAspectRatio =
    Number.isFinite(aspectRatio) && aspectRatio > 0
      ? aspectRatio
      : safeWidth / safeHeight;
  const viewBoxWidth = safeAspectRatio >= 1 ? safeAspectRatio * 100 : 100;
  const viewBoxHeight = safeAspectRatio >= 1 ? 100 : 100 / safeAspectRatio;
  const previewAspectRatioCssValue =
    safeAspectRatio >= 1
      ? `${safeAspectRatio} / 1`
      : `1 / ${1 / safeAspectRatio}`;
  const horizontalLineY = 9;
  const verticalLineX = viewBoxWidth - 9;
  const arrowStrokeWidth = 3.6;
  const arrowHeadDepth = 5;
  const arrowHeadHalfSpan = 3.8;
  const horizontalLineStart = arrowHeadDepth;
  const horizontalLineEnd = viewBoxWidth - arrowHeadDepth;
  const verticalLineStart = arrowHeadDepth;
  const verticalLineEnd = viewBoxHeight - arrowHeadDepth;
  const style = {
    "--wall-canvas-preview-aspect-ratio": previewAspectRatioCssValue,
    "--wall-canvas-preview-width-label-top": `${(horizontalLineY / viewBoxHeight) * 100}%`,
    "--wall-canvas-preview-height-label-left": `${(verticalLineX / viewBoxWidth) * 100}%`,
    "--wall-canvas-preview-measure-color": "var(--color-bg)",
    "--wall-canvas-preview-measure-text-color": "var(--color-fg)",
  } as CSSProperties;
  const measureBadgeStyle = {
    background: "var(--wall-canvas-preview-measure-color)",
    color: "var(--wall-canvas-preview-measure-text-color)",
  } as CSSProperties;

  return (
    <div className="mx-auto w-full max-w-[1040px]" style={style}>
      <div
        className="relative isolate overflow-hidden border border-border shadow-[var(--shadow-elevated)]"
        style={{
          aspectRatio: "var(--wall-canvas-preview-aspect-ratio, 1 / 1)",
          background:
            "radial-gradient(circle at top, rgba(255, 255, 255, 0.14), transparent 44%), #171310",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="h-full w-full object-cover"
          src={imageUrl}
          alt="キャンバスサイズのプレビュー"
        />
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full drop-shadow-[0_2px_6px_rgba(20,17,14,0.42)]"
          viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        >
          <line
            className="fill-none stroke-[var(--wall-canvas-preview-measure-color)] [stroke-linecap:square] [vector-effect:non-scaling-stroke]"
            style={{ strokeWidth: arrowStrokeWidth }}
            x1={horizontalLineStart}
            x2={horizontalLineEnd}
            y1={horizontalLineY}
            y2={horizontalLineY}
          />
          <polygon
            className="fill-[var(--wall-canvas-preview-measure-color)] [vector-effect:non-scaling-stroke]"
            points={`0,${horizontalLineY} ${arrowHeadDepth},${horizontalLineY - arrowHeadHalfSpan} ${arrowHeadDepth},${horizontalLineY + arrowHeadHalfSpan}`}
          />
          <polygon
            className="fill-[var(--wall-canvas-preview-measure-color)] [vector-effect:non-scaling-stroke]"
            points={`${viewBoxWidth},${horizontalLineY} ${viewBoxWidth - arrowHeadDepth},${horizontalLineY - arrowHeadHalfSpan} ${viewBoxWidth - arrowHeadDepth},${horizontalLineY + arrowHeadHalfSpan}`}
          />
          <line
            className="fill-none stroke-[var(--wall-canvas-preview-measure-color)] [stroke-linecap:square] [vector-effect:non-scaling-stroke]"
            style={{ strokeWidth: arrowStrokeWidth }}
            x1={verticalLineX}
            x2={verticalLineX}
            y1={verticalLineStart}
            y2={verticalLineEnd}
          />
          <polygon
            className="fill-[var(--wall-canvas-preview-measure-color)] [vector-effect:non-scaling-stroke]"
            points={`${verticalLineX},0 ${verticalLineX - arrowHeadHalfSpan},${arrowHeadDepth} ${verticalLineX + arrowHeadHalfSpan},${arrowHeadDepth}`}
          />
          <polygon
            className="fill-[var(--wall-canvas-preview-measure-color)] [vector-effect:non-scaling-stroke]"
            points={`${verticalLineX},${viewBoxHeight} ${verticalLineX - arrowHeadHalfSpan},${viewBoxHeight - arrowHeadDepth} ${verticalLineX + arrowHeadHalfSpan},${viewBoxHeight - arrowHeadDepth}`}
          />
        </svg>
        <div className="pointer-events-none absolute left-1/2 top-[var(--wall-canvas-preview-width-label-top,9%)] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center">
          <span
            className="inline-flex min-h-10 items-center justify-center rounded-full px-[18px] text-[clamp(0.84rem,2vw,1rem)] font-extrabold tracking-[0.04em] whitespace-nowrap shadow-[0_14px_32px_rgba(20,17,14,0.22)] backdrop-blur-[10px]"
            style={measureBadgeStyle}
          >
            {formatPixelMeasure(safeWidth)}
          </span>
        </div>
        <div className="pointer-events-none absolute left-[var(--wall-canvas-preview-height-label-left,91%)] top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center">
          <span
            className="-rotate-90 inline-flex min-h-10 items-center justify-center rounded-full px-[18px] text-[clamp(0.84rem,2vw,1rem)] font-extrabold tracking-[0.04em] whitespace-nowrap shadow-[0_14px_32px_rgba(20,17,14,0.22)] backdrop-blur-[10px]"
            style={measureBadgeStyle}
          >
            {formatPixelMeasure(safeHeight)}
          </span>
        </div>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <span
            className="inline-flex min-h-12 items-center justify-center rounded-full px-5 text-[clamp(0.96rem,2.4vw,1.28rem)] font-extrabold tracking-[0.04em] whitespace-nowrap shadow-[0_14px_32px_rgba(20,17,14,0.22)] backdrop-blur-[10px]"
            style={measureBadgeStyle}
          >
            {safeWidth} x {safeHeight}
          </span>
        </div>
      </div>
    </div>
  );
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
    <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="w-full sm:w-auto">
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
  registrationMethod,
}: NewWallRegistrationFormProps) {
  const router = useRouter();
  const selectedLocationRef = useRef<LocationValue | null>(null);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState<WallStep>(registrationMethod);
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
  const [messages, setMessages] = useState<string[]>([]);
  const [uploadPhase, setUploadPhase] = useState<string | null>(null);
  const [rectifyPhase, setRectifyPhase] = useState<string | null>(null);
  const [aspectPhase, setAspectPhase] = useState<string | null>(null);
  const [submitPhase, setSubmitPhase] = useState<string | null>(null);
  const [scanLocationMessage, setScanLocationMessage] = useState<string | null>(
    null,
  );
  const [addressLookupNotice, setAddressLookupNotice] = useState<string | null>(
    null,
  );
  const [addressLookupError, setAddressLookupError] = useState<string | null>(
    null,
  );
  const [isAddressLookupPending, setIsAddressLookupPending] = useState(false);
  const [lastAddressLookupLocation, setLastAddressLookupLocation] =
    useState<LocationValue | null>(null);
  const [
    hasLocationChangedSinceAddressLookup,
    setHasLocationChangedSinceAddressLookup,
  ] = useState(true);
  const [success, setSuccess] = useState<CreateWallResponse | null>(null);
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false);

  useEffect(() => {
    return () => {
      uploadAbortControllerRef.current?.abort();
      uploadAbortControllerRef.current = null;
    };
  }, []);

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
    registrationMethod === "upload"
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
  const selectedLocation =
    latitude !== null && longitude !== null
      ? {
          latitude,
          longitude,
        }
      : null;
  const canAutofillDisplayAddress =
    Boolean(mapTilerKey) &&
    selectedLocation !== null &&
    !isAddressLookupPending &&
    (lastAddressLookupLocation === null ||
      hasLocationChangedSinceAddressLookup);
  const stepFlow = getStepFlow(registrationMethod);
  const currentStepIndex = Math.max(0, stepFlow.indexOf(step));
  const totalSteps = stepFlow.length;
  const hasDeterminateProgress = totalSteps > 1;
  const progressPercent = hasDeterminateProgress
    ? (currentStepIndex / (totalSteps - 1)) * 100
    : 0;
  const progressStatus = hasDeterminateProgress
    ? `${currentStepIndex + 1} / ${totalSteps}`
    : "開始";
  const progressDescription = hasDeterminateProgress
    ? `全${totalSteps}ステップ中${currentStepIndex + 1}ステップ目`
    : "登録方法を選択";
  const isUploadProcessing = uploadPhase !== null;
  const canSubmit =
    Boolean(selectedImage) &&
    Boolean(effectiveRectifiedPreview) &&
    values.name.trim().length > 0 &&
    latitude !== null &&
    longitude !== null &&
    !rectifyPhase &&
    !aspectPhase &&
    !submitPhase;

  useEffect(() => {
    selectedLocationRef.current = selectedLocation;
  }, [selectedLocation]);

  useEffect(() => {
    if (
      hasLocationChangedSinceAddressLookup ||
      !selectedLocation ||
      !lastAddressLookupLocation ||
      areLocationsEqual(selectedLocation, lastAddressLookupLocation)
    ) {
      return;
    }

    setHasLocationChangedSinceAddressLookup(true);
    setAddressLookupNotice(null);
    setAddressLookupError(null);
  }, [
    hasLocationChangedSinceAddressLookup,
    lastAddressLookupLocation,
    selectedLocation,
  ]);

  function cancelUploadProcessing() {
    uploadAbortControllerRef.current?.abort();
    uploadAbortControllerRef.current = null;
    setUploadPhase(null);

    if (uploadInputRef.current) {
      uploadInputRef.current.value = "";
    }
  }

  function resetImagePipeline() {
    cancelUploadProcessing();
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
    setAddressLookupNotice(null);
    setAddressLookupError(null);
    setIsAddressLookupPending(false);
    setLastAddressLookupLocation(null);
    setHasLocationChangedSinceAddressLookup(true);
  }

  function goBack() {
    const previousStep = stepFlow[currentStepIndex - 1];

    setMessages([]);

    if (previousStep) {
      if (step === "upload" || previousStep === "upload") {
        resetImagePipeline();
      }

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
    router.replace("/walls/new");
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
    cancelUploadProcessing();
    setIsDiscardDialogOpen(false);
    leaveRegistration();
  }

  function handleOpenDiscardDialog() {
    cancelUploadProcessing();
    setIsDiscardDialogOpen(true);
  }

  async function handleNext() {
    setMessages([]);

    if (step === "upload" && !selectedImage) {
      setMessages(["壁画像をアップロードしてください。"]);
      return;
    }

    if (step === "region") {
      const confirmed = await ensureRectifiedPreview();

      if (!confirmed) {
        return;
      }
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
    const input = event.currentTarget;
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    uploadAbortControllerRef.current?.abort();
    const uploadAbortController = new AbortController();
    uploadAbortControllerRef.current = uploadAbortController;

    setMessages([]);
    setUploadIssues([]);
    setSuccess(null);
    setUploadPhase("画像を処理しています…");
    setRectifyPhase(null);
    setAspectPhase(null);
    setSubmitPhase(null);
    setRectifiedPreview(null);
    setAspectAdjustedPreview(null);
    setScanLocationMessage(null);

    try {
      const preparedImage = await prepareWallImageFile(file, {
        signal: uploadAbortController.signal,
      });

      if (
        uploadAbortController.signal.aborted ||
        uploadAbortControllerRef.current !== uploadAbortController
      ) {
        return;
      }

      setUploadPhase("画像を確認しています…");
      const inspection = await inspectWallImage(preparedImage.file, {
        originalFileSize: preparedImage.originalFileSize,
        signal: uploadAbortController.signal,
      });

      if (
        uploadAbortController.signal.aborted ||
        uploadAbortControllerRef.current !== uploadAbortController
      ) {
        return;
      }

      if (inspection.errors.length > 0) {
        setSelectedImage(null);
        setCorners(getDefaultCornerCoordinates(1200, 800));
        setUploadIssues([
          ...inspection.errors,
          "別のファイルをアップロードしてください。",
        ]);
        uploadAbortControllerRef.current = null;
        setUploadPhase(null);
        input.value = "";
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
      uploadAbortControllerRef.current = null;
      setUploadPhase(null);
      setStep("region");
    } catch (error) {
      if (
        isAbortError(error) ||
        uploadAbortControllerRef.current !== uploadAbortController
      ) {
        return;
      }

      uploadAbortControllerRef.current = null;
      setSelectedImage(null);
      setUploadIssues([
        error instanceof Error
          ? error.message
          : "画像の読み込みに失敗しました。",
        "別のファイルをアップロードしてください。",
      ]);
      setUploadPhase(null);
      input.value = "";
    }
  }

  function fillLocationFromScan() {
    setAddressLookupNotice(null);
    setAddressLookupError(null);

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

  async function handleAutofillDisplayAddress() {
    if (!selectedLocation || !mapTilerKey || isAddressLookupPending) {
      return;
    }

    const lookupLocation = { ...selectedLocation };
    const params = new URLSearchParams({
      key: mapTilerKey,
      language: "ja",
      limit: "1",
      types: "address",
    });

    setAddressLookupNotice(null);
    setAddressLookupError(null);
    setIsAddressLookupPending(true);
    setLastAddressLookupLocation(lookupLocation);
    setHasLocationChangedSinceAddressLookup(false);

    try {
      const response = await fetch(
        `https://api.maptiler.com/geocoding/${lookupLocation.longitude},${lookupLocation.latitude}.json?${params.toString()}`,
      );

      if (!response.ok) {
        throw new Error("住所を自動入力できませんでした。");
      }

      const payload =
        (await response.json()) as MapTilerReverseGeocodingResponse;
      const resolvedAddress = payload.features
        ?.map((feature) =>
          typeof feature.place_name === "string"
            ? formatReverseGeocodedDisplayAddress(feature.place_name)
            : "",
        )
        .find((address) => address.length > 0);

      if (!resolvedAddress) {
        throw new Error("地図上の位置から住所を見つけられませんでした。");
      }

      if (!areLocationsEqual(selectedLocationRef.current, lookupLocation)) {
        setAddressLookupError(
          "マップピンが移動したため、自動入力結果は反映しませんでした。もう一度お試しください。",
        );
        return;
      }

      setValues((current) => ({
        ...current,
        displayAddress: resolvedAddress,
      }));
      setAddressLookupNotice(
        "地図上の位置から住所を自動入力しました。必要に応じて自由に編集できます。",
      );
    } catch (error) {
      setAddressLookupError(
        error instanceof Error
          ? error.message
          : "住所を自動入力できませんでした。",
      );
    } finally {
      setIsAddressLookupPending(false);
    }
  }

  function handleScanCapture(capture: ScannedWallCapture) {
    const nextPreviewUrl = URL.createObjectURL(capture.file);

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

  async function ensureRectifiedPreview() {
    if (rectifiedPreview) {
      return true;
    }

    if (!selectedImage) {
      setMessages(["先に壁画像を用意してください。"]);
      return false;
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
      return true;
    } catch (error) {
      setMessages([
        error instanceof Error
          ? error.message
          : "rectified の生成に失敗しました。",
      ]);
      setRectifyPhase(null);
      return false;
    }
  }

  function handleAspectRatioChange(nextValue: number) {
    setAspectRatioValue(clamp(nextValue, ASPECT_RATIO_MIN, ASPECT_RATIO_MAX));
    setAspectAdjustedPreview(null);
  }

  async function confirmAspectRatio() {
    if (!rectifiedPreview) {
      setMessages(["先にキャンバス範囲を選択し、傾きを補正してください。"]);
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
      setMessages(["キャンバス範囲を選択してください。"]);
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
      formData.set("displayAddress", values.displayAddress);
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
        className="h-1 transition-all duration-200 bg-bg-muted"
        aria-hidden="true"
      >
        <div
          className="h-full bg-primary"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );

  const renderUploadStep = () => (
    <>
      <div className="section-topline">
        <div className="stack-sm">
          <h2 className="section-title text-2xl font-bold">
            写真をアップロード
          </h2>
          <p className="section-copy">
            壁全体が入った画像をアップロードしてください。
          </p>
        </div>
      </div>
      <div className="flex items-center justify-center w-full relative">
        {isUploadProcessing ? (
          <div className="absolute inset-0 z-[60] grid place-items-center rounded-lg bg-[rgba(255,250,241,0.94)] p-6 backdrop-blur-[6px]">
            <div className="text-center">
              <Spinner label={uploadPhase ?? undefined} size="lg" />
            </div>
          </div>
        ) : null}
        <label
          htmlFor="dropzone-file"
          className="flex flex-col items-center justify-center w-full h-64 border border-dashed rounded-lg cursor-pointer hover:bg-bg-elevated"
        >
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <UploadSimpleIcon size={40} />
            <p className="mb-2">
              クリックまたはドラッグ＆ドロップでアップロード
            </p>
            <p className="text-xs">対応ファイル形式: JPG, PNG, WebP, HEIC</p>
          </div>
          <input
            id="dropzone-file"
            type="file"
            className="hidden"
            accept={WALL_IMAGE_INPUT_ACCEPT}
            onChange={handleImageSelection}
            ref={uploadInputRef}
          />
        </label>
      </div>

      <ul className="mt-4 space-y-1">
        <li>※ 短辺1080px以上、ファイルサイズ10MB 以下です。</li>
        <li>※ アスペクト比は 1:3 から 3:1 です。</li>
        <li>※ 暗すぎる画像では、ARが正しく動作しない可能性があります。</li>
      </ul>

      {uploadIssues.length > 0 ? (
        <div className="error-banner mt-4">
          <strong>この画像はアップロードできません。</strong>
          <ul>
            {uploadIssues.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}
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
          router.replace("/walls/new?reason=scan-resolution-insufficient")
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

          {rectifyPhase ? <div className="notice">{rectifyPhase}</div> : null}
        </div>
      ) : (
        <div className="empty-state">先に壁画像を用意してください。</div>
      )}

      <StepNavigation
        nextBusy={Boolean(rectifyPhase)}
        nextDisabled={!selectedImage || Boolean(rectifyPhase)}
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
            スライダーでアスペクト比を調節してください。
          </p>
        </div>
      </div>

      {rectifiedPreview ? (
        <div className="grid items-center gap-[18px] max-[720px]:grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.62fr)]">
          <div className="grid min-h-80 place-items-center">
            <div className="grid aspect-square w-full max-w-[440px] place-items-center">
              <div
                className="max-h-full max-w-full justify-self-center overflow-hidden border border-border-strong bg-bg shadow-[0_18px_42px_rgba(31,26,20,0.16)] transition-[width,height] duration-150"
                style={{
                  width: `${aspectPreviewFrame.widthPercent}%`,
                  height: `${aspectPreviewFrame.heightPercent}%`,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="block h-full w-full object-fill"
                  src={rectifiedPreview.previewUrl}
                  alt="比率調整中の rectified プレビュー"
                />
              </div>
            </div>
          </div>

          <div className="stack-md">
            <label className="grid gap-3 font-bold">
              <span>{formatAspectRatio(aspectRatioValue)}</span>
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
            <div
              className="flex justify-between gap-3 text-sm font-bold text-fg-muted"
              aria-hidden="true"
            >
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
                <ArrowCounterClockwiseIcon size={20} />
                <span>元に戻す</span>
              </button>
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
          キャンバスサイズの目安
        </Link>
      </div>

      {effectiveRectifiedPreview ? (
        <div className="stack-md">
          <input
            className="range-input"
            max={CANVAS_MAX_SIZE}
            min={CANVAS_MIN_SIZE}
            onChange={(event) => setCanvasLongSide(Number(event.target.value))}
            type="range"
            value={canvasLongSide}
          />

          <CanvasSizePreview
            aspectRatio={canvasAspectRatio}
            imageUrl={effectiveRectifiedPreview.previewUrl}
            width={canvasDimensions.width}
            height={canvasDimensions.height}
          />
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
          <p className="section-copy">壁の名前と場所を入力してください。</p>
        </div>
      </div>

      {scanLocationMessage ? (
        <div className="notice">{scanLocationMessage}</div>
      ) : null}

      <div className="mb-4 grid gap-4">
        <label className="field-label">
          壁の名称
          <input
            className="rounded-lg"
            onChange={(event) =>
              setValues((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="例：区民センターの案内板"
            value={values.name}
          />
        </label>
      </div>

      <fieldset>
        <legend className="text-fg-muted mb-2">壁の場所</legend>
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
          value={selectedLocation}
        />
      </fieldset>
      <div className="mt-4 grid gap-3">
        <label className="field-label" htmlFor="display_address">
          場所の説明
        </label>

        <div className="flex flex-wrap gap-3">
          <button
            className="button button-secondary"
            disabled={!canAutofillDisplayAddress}
            type="button"
            onClick={() => void handleAutofillDisplayAddress()}
          >
            {isAddressLookupPending ? "住所を取得中…" : "マップから自動入力"}
          </button>
        </div>
        {addressLookupError ? (
          <div className="error-banner">{addressLookupError}</div>
        ) : null}
        {addressLookupNotice ? (
          <div className="notice">{addressLookupNotice}</div>
        ) : null}
        <input
          id="display_address"
          className="rounded-lg"
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              displayAddress: event.target.value,
            }))
          }
          placeholder="例：東京都千代田区丸の内1丁目"
          value={values.displayAddress}
        />
        {lastAddressLookupLocation && !hasLocationChangedSinceAddressLookup ? (
          <p className="m-0 muted-copy">
            地図のピンを動かすと、もう一度「マップから自動入力」を使えます。
          </p>
        ) : (
          <p className="m-0 muted-copy">
            自動入力したあとも、追記や削除を自由に行えます。
          </p>
        )}
      </div>

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
          <h2 className="section-title text-2xl font-bold">登録内容を確認</h2>
          <p className="section-copy">
            登録はまだ完了していません。入力内容に間違いなければ「登録する」ボタンをクリックしてください。
          </p>
        </div>
      </div>

      <div className="mb-4 grid gap-5">
        <section className="grid gap-4">
          <div className="stack-sm">
            <h3 className="m-0 text-lg leading-6">壁の名称</h3>
            <p className="m-0 text-[clamp(1.8rem,3vw,2.6rem)] leading-none">
              {values.name.trim()}
            </p>
          </div>
        </section>

        <section className="grid gap-4">
          <div className="stack-sm">
            <div className="stack-sm">
              <h3 className="m-0 text-lg leading-6">位置情報</h3>
            </div>
            <LocationPreviewMap
              mapTilerKey={mapTilerKey}
              value={selectedLocation}
            />
            <div className="grid gap-1">
              <div className="mono">
                緯度・経度: {formatCoordinate(latitude ?? 0)},{" "}
                {formatCoordinate(longitude ?? 0)}
              </div>
              <div>
                場所の説明:{" "}
                {values.displayAddress.trim().length > 0
                  ? values.displayAddress.trim()
                  : "未入力"}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4">
          <div className="stack-sm">
            <div className="stack-sm">
              <h3 className="m-0 text-lg leading-6">壁画像とサイズ</h3>
              <p className="muted-copy">
                {canvasDimensions.width} x {canvasDimensions.height}px
                のキャンバスとして登録されます。
              </p>
            </div>

            {effectiveRectifiedPreview ? (
              <CanvasSizePreview
                aspectRatio={canvasAspectRatio}
                imageUrl={effectiveRectifiedPreview.previewUrl}
                width={canvasDimensions.width}
                height={canvasDimensions.height}
              />
            ) : (
              <div className="empty-state">
                先に壁画像とキャンバス設定を完了してください。
              </div>
            )}
          </div>
        </section>
      </div>

      {submitPhase ? <div className="notice">{submitPhase}</div> : null}

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          className="button button-secondary w-full justify-center"
          onClick={goBack}
          type="button"
        >
          戻る
        </button>
        <div className="inline-actions">
          <button
            className="button button-primary w-full justify-center"
            disabled={!canSubmit}
            type="submit"
          >
            {submitPhase ? "送信中…" : "登録する"}
          </button>
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
                ? "登録方法選択へ戻る"
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
              onClick={handleOpenDiscardDialog}
              type="button"
            >
              キャンセル
            </button>
          )
        }
      />
      {renderProgress()}
      <form
        aria-busy={isUploadProcessing}
        className="relative mx-auto w-full max-w-[1120px] px-4 pt-6 pb-10 max-[720px]:px-2.5 max-[720px]:pt-[18px] max-[720px]:pb-7"
        onSubmit={handleSubmit}
      >
        {success ? (
          <div className="success-banner">
            <strong>{success.name} を登録しました。</strong>
            <div className="stack-sm mt-2">
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
                <Link className="button button-secondary" href="/walls/new">
                  登録方法選択へ戻る
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
        description="ここまで入力した内容は保存されません。新規壁登録を中止して登録方法の選択へ戻ります。"
        onCancel={() => setIsDiscardDialogOpen(false)}
        onConfirm={handleDiscardRegistration}
        open={isDiscardDialogOpen}
        title="入力内容を破棄しますか？"
      />
    </>
  );
}
