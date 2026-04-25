"use client";

import { useEffect, useRef, useState } from "react";
import type { CornerCoordinate } from "@street-art/shared";
import { getDefaultCornerCoordinates } from "../../lib/walls";

const JPEG_QUALITY = 0.9;

const SCAN_GUIDANCE = [
  "正面から撮影してください",
  "四隅を入れてください",
  "長方形の壁のみ登録可能です",
];

export type ScannedWallCapture = {
  file: File;
  width: number;
  height: number;
  corners: CornerCoordinate[];
};

type WallScannerProps = {
  onCapture: (capture: ScannedWallCapture) => void;
  onResolutionInsufficient: () => void;
};

const RESOLUTION_CONSTRAINT_NAMES = new Set([
  "OverconstrainedError",
  "ConstraintNotSatisfiedError",
]);

function isResolutionConstraintError(error: unknown) {
  if (!error || typeof error !== "object" || !("name" in error)) {
    return false;
  }

  if (
    typeof error.name !== "string" ||
    !RESOLUTION_CONSTRAINT_NAMES.has(error.name)
  ) {
    return false;
  }

  if (!("constraint" in error) || typeof error.constraint !== "string") {
    return true;
  }

  return error.constraint === "width" || error.constraint === "height";
}

async function shouldHandleAsResolutionError(error: unknown) {
  if (isResolutionConstraintError(error)) {
    return true;
  }

  if (
    !error ||
    typeof error !== "object" ||
    !("name" in error) ||
    error.name !== "NotFoundError" ||
    !navigator.mediaDevices?.enumerateDevices
  ) {
    return false;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();

    return devices.some((device) => device.kind === "videoinput");
  } catch {
    return false;
  }
}

function canvasToJpegFile(canvas: HTMLCanvasElement) {
  return new Promise<File>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("スキャン画像を書き出せませんでした。"));
          return;
        }

        resolve(
          new File([blob], `wall-scan-${Date.now()}.jpg`, {
            type: "image/jpeg",
          }),
        );
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

export function WallScanner({
  onCapture,
  onResolutionInsufficient,
}: WallScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onCaptureRef = useRef(onCapture);
  const onResolutionInsufficientRef = useRef(onResolutionInsufficient);
  const capturedRef = useRef(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [videoSize, setVideoSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    onCaptureRef.current = onCapture;
  }, [onCapture]);

  useEffect(() => {
    onResolutionInsufficientRef.current = onResolutionInsufficient;
  }, [onResolutionInsufficient]);

  async function captureCurrentFrame() {
    const video = videoRef.current;

    if (
      !video ||
      !video.videoWidth ||
      !video.videoHeight ||
      capturedRef.current
    ) {
      return;
    }

    capturedRef.current = true;
    setIsCapturing(true);

    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Canvas 2D context could not be created.");
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const file = await canvasToJpegFile(canvas);

      onCaptureRef.current({
        corners: getDefaultCornerCoordinates(canvas.width, canvas.height),
        file,
        height: canvas.height,
        width: canvas.width,
      });
    } catch (error) {
      capturedRef.current = false;
      setCameraError(
        error instanceof Error
          ? error.message
          : "スキャン画像の撮影に失敗しました。",
      );
      setIsCapturing(false);
    }
  }

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("このブラウザではカメラを利用できません。");
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            height: { min: 1080 },
            width: { min: 1080 },
            aspectRatio: 1,
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const video = videoRef.current;

        if (!video) {
          return;
        }

        video.srcObject = stream;
        await video.play();
        setVideoSize({ width: video.videoWidth, height: video.videoHeight });
      } catch (error) {
        if (await shouldHandleAsResolutionError(error)) {
          onResolutionInsufficientRef.current();
          return;
        }

        setCameraError(
          error instanceof Error
            ? error.message
            : "カメラを開始できませんでした。",
        );
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="scanner-shell">
      <div className="scanner-view">
        <video
          autoPlay
          className="scanner-video"
          muted
          playsInline
          ref={videoRef}
        />
        <div className="scanner-status">
          <ul className="scanner-guidance-list">
            {SCAN_GUIDANCE.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      </div>

      {cameraError ? (
        <div className="error-banner">
          <strong>カメラを確認してください。</strong>
          <div>{cameraError}</div>
        </div>
      ) : null}

      <div className="inline-actions">
        <button
          className="button button-secondary"
          disabled={!videoSize || isCapturing}
          onClick={() => void captureCurrentFrame()}
          type="button"
        >
          撮影する
        </button>
      </div>
    </div>
  );
}
