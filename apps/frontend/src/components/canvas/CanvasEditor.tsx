"use client";

import Link from "next/link";
import {
  useEffect,
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  getPaletteIndexFromPixelValue,
  normalizePixelValue,
  TRANSPARENT_PIXEL_VALUE,
  type CanvasSnapshot,
} from "@street-art/shared";
import { decodeBase64Pixels, getCanvasWebSocketUrl } from "../../lib/canvas";

type CanvasEditorProps = {
  initialSnapshot: CanvasSnapshot;
  wallName?: string | null;
  wsBase: string;
  leaveHref: string;
  referenceImageUrl?: string | null;
};

type ConnectionState = "connecting" | "open" | "closed" | "error";

function getInitialZoom(width: number, height: number) {
  const longestEdge = Math.max(width, height);
  return Math.max(2, Math.min(12, Math.round(448 / longestEdge)));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function parsePaletteColors(palette: string[]) {
  return [
    null,
    ...palette.map((color) => [
      Number.parseInt(color.slice(1, 3), 16),
      Number.parseInt(color.slice(3, 5), 16),
      Number.parseInt(color.slice(5, 7), 16),
    ]),
  ] satisfies Array<number[] | null>;
}

function decodeSnapshotPixels(encoded: string, paletteLength: number) {
  const pixels = decodeBase64Pixels(encoded);

  for (let index = 0; index < pixels.length; index += 1) {
    pixels[index] = normalizePixelValue(pixels[index] ?? 0, paletteLength);
  }

  return pixels;
}

function getDefaultSelectedColor(paletteLength: number) {
  return paletteLength > 0 ? 1 : TRANSPARENT_PIXEL_VALUE;
}

function getHexColorForPixelValue(pixelValue: number, palette: string[]) {
  const paletteIndex = getPaletteIndexFromPixelValue(
    normalizePixelValue(pixelValue, palette.length),
  );

  return paletteIndex === null ? null : palette[paletteIndex] ?? null;
}

function drawSnapshotToCanvas(
  canvas: HTMLCanvasElement,
  pixels: Uint8Array,
  width: number,
  height: number,
  parsedPalette: Array<number[] | null>,
) {
  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  const imageData = context.createImageData(width, height);
  const data = imageData.data;

  for (let index = 0; index < pixels.length; index += 1) {
    const color = parsedPalette[pixels[index] ?? 0] ?? null;
    const offset = index * 4;

    if (!color) {
      data[offset + 3] = 0;
      continue;
    }

    data[offset] = color[0];
    data[offset + 1] = color[1];
    data[offset + 2] = color[2];
    data[offset + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
}

function getLinePixels(
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const pixels: Array<{ x: number; y: number }> = [];
  const deltaX = Math.abs(to.x - from.x);
  const deltaY = Math.abs(to.y - from.y);
  const stepX = from.x < to.x ? 1 : -1;
  const stepY = from.y < to.y ? 1 : -1;
  let x = from.x;
  let y = from.y;
  let error = deltaX - deltaY;

  while (true) {
    pixels.push({ x, y });

    if (x === to.x && y === to.y) {
      return pixels;
    }

    const doubledError = error * 2;

    if (doubledError > -deltaY) {
      error -= deltaY;
      x += stepX;
    }

    if (doubledError < deltaX) {
      error += deltaX;
      y += stepY;
    }
  }
}

export function CanvasEditor({
  initialSnapshot,
  wallName,
  wsBase,
  leaveHref,
  referenceImageUrl,
}: CanvasEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
  const minimapFrameRef = useRef<HTMLDivElement>(null);
  const dirtyPixelsRef = useRef<Array<{ x: number; y: number; color: number }>>([]);
  const redrawQueuedRef = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);
  const pixelsRef = useRef(
    decodeSnapshotPixels(initialSnapshot.pixels, initialSnapshot.palette.length),
  );
  const paletteRef = useRef(initialSnapshot.palette);
  const parsedPaletteRef = useRef(parsePaletteColors(initialSnapshot.palette));
  const zoomRef = useRef(
    getInitialZoom(initialSnapshot.width, initialSnapshot.height),
  );
  const panRef = useRef({ x: 0, y: 0 });
  const spacePressedRef = useRef(false);
  const panStartRef = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null>(null);
  const lastPointerPixelRef = useRef<{ x: number; y: number } | null>(null);

  const [selectedColor, setSelectedColor] = useState(() =>
    getDefaultSelectedColor(initialSnapshot.palette.length),
  );
  const [palette, setPalette] = useState(initialSnapshot.palette);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const [zoom, setZoom] = useState(() =>
    getInitialZoom(initialSnapshot.width, initialSnapshot.height),
  );
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const [statusMessage, setStatusMessage] =
    useState("キャンバスに接続しています。");
  const [hoveredPixel, setHoveredPixel] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [viewportFrame, setViewportFrame] = useState({
    left: 0,
    top: 0,
    width: 100,
    height: 100,
    enabled: false,
  });
  const [surfaceFrame, setSurfaceFrame] = useState(() => {
    const initialZoom = getInitialZoom(
      initialSnapshot.width,
      initialSnapshot.height,
    );

    return {
      left: 0,
      top: 0,
      width: initialSnapshot.width * initialZoom,
      height: initialSnapshot.height * initialZoom,
    };
  });

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    setSelectedColor((current) => {
      if (current === TRANSPARENT_PIXEL_VALUE || current <= palette.length) {
        return current;
      }

      return getDefaultSelectedColor(palette.length);
    });
  }, [palette]);

  const drawDirtyPixels = useCallback(() => {
    if (dirtyPixelsRef.current.length === 0) {
      return;
    }
    const canvas = canvasRef.current;
    const minimapCanvas = minimapCanvasRef.current;
    if (!canvas || !minimapCanvas) {
      return;
    }

    const mainCtx = canvas.getContext("2d");
    const minimapCtx = minimapCanvas.getContext("2d");
    if (!mainCtx || !minimapCtx) {
      return;
    }
    console.log(`[Canvas] Drawing ${dirtyPixelsRef.current.length} dirty pixels.`);

    const pixelsToDraw = [...dirtyPixelsRef.current];
    dirtyPixelsRef.current = [];

    // ダーティなピクセルを個別に描画する。
    // getImageData/putImageDataでキャンバス全体を更新するよりも、
    // 変更箇所が少ない場合はこちらの方が高速なことが多い。
    for (const pixel of pixelsToDraw) {
      const colorString = getHexColorForPixelValue(pixel.color, paletteRef.current);

      // メインキャンバスとミニマップの両方を更新
      if (!colorString) {
        mainCtx.clearRect(pixel.x, pixel.y, 1, 1);
        minimapCtx.clearRect(pixel.x, pixel.y, 1, 1);
        continue;
      }

      mainCtx.fillStyle = colorString;
      mainCtx.fillRect(pixel.x, pixel.y, 1, 1);
      minimapCtx.fillStyle = colorString;
      minimapCtx.fillRect(pixel.x, pixel.y, 1, 1);
    }
  }, []);

  const drawAllCanvases = useCallback(() => {
    drawDirtyPixels(); // Ensure any pending changes are drawn first
    if (canvasRef.current) {
      drawSnapshotToCanvas(
        canvasRef.current,
        pixelsRef.current,
        initialSnapshot.width,
        initialSnapshot.height,
        parsedPaletteRef.current,
      );
    }

    if (minimapCanvasRef.current) {
      drawSnapshotToCanvas(
        minimapCanvasRef.current,
        pixelsRef.current,
        initialSnapshot.width,
        initialSnapshot.height,
        parsedPaletteRef.current,
      );
    }
  }, [drawDirtyPixels, initialSnapshot.height, initialSnapshot.width]);

  const requestRedraw = useCallback(() => {
    if (redrawQueuedRef.current) {
      return;
    }
    redrawQueuedRef.current = true;
    console.log("[Canvas] Redraw requested.");
    requestAnimationFrame(() => {
      drawDirtyPixels();
      redrawQueuedRef.current = false;
    });
  }, [drawDirtyPixels]);

  const getViewportMetrics = useCallback((
    nextZoom = zoomRef.current,
    proposedPan = panRef.current,
  ) => {
    const stage = stageRef.current;

    if (!stage) {
      return null;
    }

    const stageRect = stage.getBoundingClientRect();
    const stageWidth = stage.clientWidth;
    const stageHeight = stage.clientHeight;
    const contentLeft = stageRect.left + (stageRect.width - stageWidth) / 2;
    const contentTop = stageRect.top + (stageRect.height - stageHeight) / 2;
    const surfaceWidth = initialSnapshot.width * nextZoom;
    const surfaceHeight = initialSnapshot.height * nextZoom;
    const maxPanX =
      surfaceWidth > stageWidth ? (surfaceWidth - stageWidth) / 2 : 0;
    const maxPanY =
      surfaceHeight > stageHeight ? (surfaceHeight - stageHeight) / 2 : 0;
    const clampedPan = {
      x: maxPanX === 0 ? 0 : clamp(proposedPan.x, -maxPanX, maxPanX),
      y: maxPanY === 0 ? 0 : clamp(proposedPan.y, -maxPanY, maxPanY),
    };
    const relativeLeft = (stageWidth - surfaceWidth) / 2 + clampedPan.x;
    const relativeTop = (stageHeight - surfaceHeight) / 2 + clampedPan.y;
    const surfaceLeft = contentLeft + relativeLeft;
    const surfaceTop = contentTop + relativeTop;

    const visibleLeft = clamp(
      (contentLeft - surfaceLeft) / nextZoom,
      0,
      initialSnapshot.width,
    );
    const visibleTop = clamp(
      (contentTop - surfaceTop) / nextZoom,
      0,
      initialSnapshot.height,
    );
    const visibleRight = clamp(
      (contentLeft + stageWidth - surfaceLeft) / nextZoom,
      0,
      initialSnapshot.width,
    );
    const visibleBottom = clamp(
      (contentTop + stageHeight - surfaceTop) / nextZoom,
      0,
      initialSnapshot.height,
    );

    return {
      clampedPan,
      contentLeft,
      contentTop,
      stageWidth,
      stageHeight,
      relativeLeft,
      relativeTop,
      surfaceLeft,
      surfaceTop,
      surfaceWidth,
      surfaceHeight,
      visibleLeft,
      visibleTop,
      visibleRight,
      visibleBottom,
      navigatorEnabled: maxPanX > 0 || maxPanY > 0,
    };
  }, [initialSnapshot.height, initialSnapshot.width]);

  const updateViewportFrameForState = useCallback((
    nextZoom = zoomRef.current,
    proposedPan = panRef.current,
  ) => {
    const metrics = getViewportMetrics(nextZoom, proposedPan);

    if (!metrics) {
      return proposedPan;
    }

    setSurfaceFrame({
      left: metrics.relativeLeft,
      top: metrics.relativeTop,
      width: metrics.surfaceWidth,
      height: metrics.surfaceHeight,
    });

    setViewportFrame({
      left: (metrics.visibleLeft / initialSnapshot.width) * 100,
      top: (metrics.visibleTop / initialSnapshot.height) * 100,
      width: ((metrics.visibleRight - metrics.visibleLeft) / initialSnapshot.width) * 100,
      height: ((metrics.visibleBottom - metrics.visibleTop) / initialSnapshot.height) * 100,
      enabled: metrics.navigatorEnabled,
    });

    return metrics.clampedPan;
  }, [getViewportMetrics, initialSnapshot.height, initialSnapshot.width]);

  function centerOnContentPosition(contentX: number, contentY: number) {
    const nextZoom = zoomRef.current;
    const nextPan = {
      x: (initialSnapshot.width / 2 - contentX) * nextZoom,
      y: (initialSnapshot.height / 2 - contentY) * nextZoom,
    };
    const clampedPan = updateViewportFrameForState(nextZoom, nextPan);

    setPan(clampedPan);
    panRef.current = clampedPan;
  }

  useEffect(() => {
    drawAllCanvases();
  }, [drawAllCanvases]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space") {
        return;
      }

      event.preventDefault();
      spacePressedRef.current = true;
      setSpacePressed(true);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") {
        return;
      }

      spacePressedRef.current = false;
      setSpacePressed(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;

    if (!stage) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();

      const currentZoom = zoomRef.current;
      const nextZoom = clamp(
        Number((currentZoom + (event.deltaY > 0 ? -0.5 : 0.5)).toFixed(2)),
        1,
        24,
      );

      if (nextZoom === currentZoom) {
        return;
      }

      const viewport = getViewportMetrics(currentZoom, panRef.current);

      if (!viewport) {
        return;
      }

      const contentX = (event.clientX - viewport.surfaceLeft) / currentZoom;
      const contentY = (event.clientY - viewport.surfaceTop) / currentZoom;
      const nextSurfaceWidth = initialSnapshot.width * nextZoom;
      const nextSurfaceHeight = initialSnapshot.height * nextZoom;
      const proposedPan = {
        x:
          event.clientX -
          viewport.contentLeft -
          (viewport.stageWidth - nextSurfaceWidth) / 2 -
          contentX * nextZoom,
        y:
          event.clientY -
          viewport.contentTop -
          (viewport.stageHeight - nextSurfaceHeight) / 2 -
          contentY * nextZoom,
      };
      const nextPan = updateViewportFrameForState(nextZoom, proposedPan);

      setZoom(nextZoom);
      setPan(nextPan);
      zoomRef.current = nextZoom;
      panRef.current = nextPan;
    };

    stage.addEventListener("wheel", handleWheel, { passive: false });

    const resizeObserver = new ResizeObserver(() => {
      const nextPan = updateViewportFrameForState();

      if (nextPan.x === panRef.current.x && nextPan.y === panRef.current.y) {
        return;
      }

      setPan(nextPan);
      panRef.current = nextPan;
    });
    resizeObserver.observe(stage);

    return () => {
      stage.removeEventListener("wheel", handleWheel);
      resizeObserver.disconnect();
    };
  }, [
    getViewportMetrics,
    initialSnapshot.height,
    initialSnapshot.width,
    updateViewportFrameForState,
  ]);

  useEffect(() => {
    const socket = new WebSocket(
      getCanvasWebSocketUrl(initialSnapshot.canvasId, wsBase),
    );
    socketRef.current = socket;
    setConnectionState("connecting");
    setStatusMessage("キャンバスに接続しています。");

    socket.addEventListener("open", () => {
      setConnectionState("open");
      setStatusMessage("リアルタイム編集が有効です。");
    });

    const handleSocketMessage = (event: MessageEvent<string>) => {
      console.log("[WS] Received message:", event.data);

      let message;
      try {
        message = JSON.parse(event.data);
      } catch (e) {
        console.error("Failed to parse JSON:", e);
        return;
      }

      if (!message?.type) {
        return;
      }

      if (message.type === "canvas:snapshot") {
        pixelsRef.current = decodeSnapshotPixels(
          message.pixels,
          message.palette.length,
        );
        paletteRef.current = message.palette;
        dirtyPixelsRef.current = []; // Clear pending changes
        parsedPaletteRef.current = parsePaletteColors(message.palette);
        setPalette(message.palette);
        drawAllCanvases();
        updateViewportFrameForState();
        setStatusMessage(`${wallName ?? "キャンバス"} と同期しました。`);
      } else if (message.type === "pixel:applied") {
        const { x, y } = message;
        const color = normalizePixelValue(message.color, paletteRef.current.length);
        const index = y * initialSnapshot.width + x;
        if (index >= 0 && index < pixelsRef.current.length) {
          pixelsRef.current[index] = color;
        }
        dirtyPixelsRef.current.push({ x, y, color });
        requestRedraw();
      } else if (message.type === "pixels:applied") {
        for (const pixel of message.pixels) {
          const index = pixel.y * initialSnapshot.width + pixel.x;
          const color = normalizePixelValue(
            pixel.color,
            paletteRef.current.length,
          );
          if (index >= 0 && index < pixelsRef.current.length) {
            pixelsRef.current[index] = color;
          }
          dirtyPixelsRef.current.push({ ...pixel, color });
        }
        requestRedraw();
      }
    };

    socket.addEventListener("close", () => {
      setConnectionState("closed");
      setStatusMessage(
        "接続が切れました。ページを再読み込みすると再接続できます。",
      );
    });

    socket.addEventListener("error", () => {
      setConnectionState("error");
      setStatusMessage("WebSocket 接続に失敗しました。");
    });

    socket.onmessage = handleSocketMessage;

    return () => {
      socket.onmessage = null;
      socket.close();
      socketRef.current = null;
    };
  }, [
    initialSnapshot.canvasId,
    wsBase,
    initialSnapshot.width,
    drawAllCanvases,
    requestRedraw,
    setPalette,
    setStatusMessage,
    updateViewportFrameForState,
    wallName,
  ]);

  useEffect(() => {
    const nextPan = updateViewportFrameForState(zoom, pan);

    if (nextPan.x === pan.x && nextPan.y === pan.y) {
      return;
    }

    setPan(nextPan);
    panRef.current = nextPan;
  }, [pan, zoom, updateViewportFrameForState]);

  function getPixelPosition(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.floor(
      ((event.clientX - rect.left) / rect.width) * initialSnapshot.width,
    );
    const y = Math.floor(
      ((event.clientY - rect.top) / rect.height) * initialSnapshot.height,
    );

    return {
      x: Math.min(Math.max(x, 0), initialSnapshot.width - 1),
      y: Math.min(Math.max(y, 0), initialSnapshot.height - 1),
    };
  }

  // この関数は、ローカルでの描画とデータモデルの更新のみを担当します。
  // WebSocketメッセージの送信は行いません。
  function applyPixelLocally(x: number, y: number, color: number) {
    if (
      !canvasRef.current
    ) {
      return;
    }

    const index = y * initialSnapshot.width + x;
    const normalizedColor = normalizePixelValue(color, paletteRef.current.length);

    if (pixelsRef.current[index] === normalizedColor) {
      return;
    }

    pixelsRef.current[index] = normalizedColor;
    dirtyPixelsRef.current.push({ x, y, color: normalizedColor });
    requestRedraw();
  }

  function paintStroke(
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      return;
    }

    const pixelsToPaint = getLinePixels(from, to);
    const pixelsForMessage: Array<{ x: number; y: number; color: number }> = [];
    const color = normalizePixelValue(selectedColor, paletteRef.current.length);

    for (const pixel of pixelsToPaint) {
      const index = pixel.y * initialSnapshot.width + pixel.x;
      if (pixelsRef.current[index] !== color) {
        applyPixelLocally(pixel.x, pixel.y, color);
        pixelsForMessage.push({ ...pixel, color });
      }
    }

    if (pixelsForMessage.length > 0) {
      socketRef.current.send(
        JSON.stringify({
          type: "pixels:set", // 複数のピクセルを一度に送信
          canvasId: initialSnapshot.canvasId,
          pixels: pixelsForMessage,
        }),
      );
    }
  }

  function startPanning(event: ReactPointerEvent<HTMLCanvasElement>) {
    panStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: panRef.current.x,
      panY: panRef.current.y,
    };
    lastPointerPixelRef.current = null;
    setIsPanning(true);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    if (event.button === 1 || event.button === 2 || spacePressedRef.current) {
      startPanning(event);
      setHoveredPixel(getPixelPosition(event));
      return;
    }

    if (event.button !== 0) {
      return;
    }

    const position = getPixelPosition(event);
    setHoveredPixel(position);
    lastPointerPixelRef.current = position;
    paintStroke(position, position);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const position = getPixelPosition(event);
    setHoveredPixel(position);

    if (panStartRef.current) {
      const nextPan = {
        x: panStartRef.current.panX + (event.clientX - panStartRef.current.x),
        y: panStartRef.current.panY + (event.clientY - panStartRef.current.y),
      };
      const clampedPan = updateViewportFrameForState(zoomRef.current, nextPan);
      setPan(clampedPan);
      panRef.current = clampedPan;
      return;
    }

    if ((event.buttons & 1) !== 1) {
      lastPointerPixelRef.current = position;
      return;
    }

    paintStroke(lastPointerPixelRef.current ?? position, position);
    lastPointerPixelRef.current = position;
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    panStartRef.current = null;
    lastPointerPixelRef.current = null;
    setIsPanning(false);
  }

  function handlePointerLeave() {
    setHoveredPixel(null);
  }

  function handleMinimapNavigate(event: ReactPointerEvent<HTMLDivElement>) {
    if (!viewportFrame.enabled) {
      return;
    }

    const minimapFrame = minimapFrameRef.current;

    if (!minimapFrame) {
      return;
    }

    const rect = minimapFrame.getBoundingClientRect();
    const contentX = clamp(
      ((event.clientX - rect.left) / rect.width) * initialSnapshot.width,
      0,
      initialSnapshot.width,
    );
    const contentY = clamp(
      ((event.clientY - rect.top) / rect.height) * initialSnapshot.height,
      0,
      initialSnapshot.height,
    );

    centerOnContentPosition(contentX, contentY);
  }

  const connectionLabel = {
    connecting: "接続中",
    open: "接続済み",
    closed: "切断",
    error: "エラー",
  } satisfies Record<ConnectionState, string>;
  const referenceBackgroundStyle = referenceImageUrl
    ? {
        backgroundImage: `url("${referenceImageUrl}")`,
      }
    : undefined;
  const selectedColorHex = getHexColorForPixelValue(selectedColor, palette);
  const selectedColorLabel =
    selectedColor === TRANSPARENT_PIXEL_VALUE
      ? "透明"
      : selectedColorHex ?? `色 ${selectedColor}`;

  return (
    <section className="canvas-editor">
      <aside className="canvas-sidebar canvas-sidebar--left">
        <div className="canvas-panel">
          <div className="stack-sm">
            <div className="page-kicker">Canvas Editor</div>
            <h1
              className="section-title"
              style={{ fontSize: "clamp(1.5rem, 3vw, 2.5rem)" }}
            >
              {wallName ?? "ライブキャンバス"}
            </h1>
          </div>
        </div>

        <div className="canvas-panel canvas-panel--grow">
          <div className="stack-sm">
            <div className="step-badge">Palette</div>
            <h2 className="section-title" style={{ fontSize: "1.2rem" }}>
              {palette.length} colors + transparent
            </h2>
            <div className="canvas-selected-color">
              <span>選択中</span>
              <strong>{selectedColorLabel}</strong>
              <i
                className={`canvas-selected-color__swatch${selectedColor === TRANSPARENT_PIXEL_VALUE ? " is-transparent" : ""}`}
                style={
                  selectedColorHex
                    ? { backgroundColor: selectedColorHex }
                    : undefined
                }
              />
            </div>
          </div>

          <div className="palette-grid">
            {palette.map((color, index) => (
              <button
                key={`${index}-${color}`}
                aria-label={`color ${index + 1}`}
                className={`palette-swatch${selectedColor === index + 1 ? " is-selected" : ""}`}
                onClick={() => setSelectedColor(index + 1)}
                style={{ backgroundColor: color }}
                type="button"
              />
            ))}
            <button
              aria-label="transparent"
              className={`palette-swatch palette-swatch--transparent${selectedColor === TRANSPARENT_PIXEL_VALUE ? " is-selected" : ""}`}
              onClick={() => setSelectedColor(TRANSPARENT_PIXEL_VALUE)}
              type="button"
            />
          </div>
        </div>
      </aside>

      <div className="canvas-stage-shell">
        <div
          className={`canvas-stage${isPanning || spacePressed ? " is-pannable" : ""}`}
          ref={stageRef}
        >
          <div
            className="canvas-stage__surface"
            style={{
              left: surfaceFrame.left,
              top: surfaceFrame.top,
              width: surfaceFrame.width,
              height: surfaceFrame.height,
            }}
          >
            <div
              className="canvas-stage__reference"
              style={referenceBackgroundStyle}
            />
            <div
              className="canvas-stage__grid"
              style={{
                backgroundSize: `${zoom}px ${zoom}px`,
                opacity: zoom >= 6 ? 0.72 : zoom >= 3 ? 0.42 : 0.22,
              }}
            />
            <canvas
              className="canvas-stage__canvas"
              height={initialSnapshot.height}
              onContextMenu={(event) => event.preventDefault()}
              onPointerDown={handlePointerDown}
              onPointerLeave={handlePointerLeave}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              ref={canvasRef}
              style={{
                width: surfaceFrame.width,
                height: surfaceFrame.height,
              }}
              width={initialSnapshot.width}
            />
            {hoveredPixel ? (
              <div
                className="canvas-stage__cursor"
                style={{
                  width: zoom,
                  height: zoom,
                  transform: `translate(${hoveredPixel.x * zoom}px, ${hoveredPixel.y * zoom}px)`,
                }}
              />
            ) : null}
          </div>
        </div>
      </div>

      <aside className="canvas-sidebar canvas-sidebar--right">
        <div className="canvas-panel">
          <div className="stack-sm">
            <div className="step-badge">View</div>
            <h2 className="section-title" style={{ fontSize: "1.15rem" }}>
              Navigator
            </h2>
          </div>

          <div
            className={`canvas-minimap${viewportFrame.enabled ? " is-active" : ""}`}
            onPointerDown={(event) => {
              if (!viewportFrame.enabled) {
                return;
              }

              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              handleMinimapNavigate(event);
            }}
            onPointerMove={(event) => {
              if (!viewportFrame.enabled || (event.buttons & 1) !== 1) {
                return;
              }

              handleMinimapNavigate(event);
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            ref={minimapFrameRef}
            style={{
              aspectRatio: `${initialSnapshot.width} / ${initialSnapshot.height}`,
            }}
          >
            <div
              className="canvas-minimap__reference"
              style={referenceBackgroundStyle}
            />
            <canvas
              className="canvas-minimap__canvas"
              height={initialSnapshot.height}
              ref={minimapCanvasRef}
              width={initialSnapshot.width}
            />
            {viewportFrame.enabled ? (
              <div
                className="canvas-minimap__viewport"
                style={{
                  left: `${viewportFrame.left}%`,
                  top: `${viewportFrame.top}%`,
                  width: `${viewportFrame.width}%`,
                  height: `${viewportFrame.height}%`,
                }}
              />
            ) : null}
          </div>

          <div className="canvas-view-controls">
            <div className="tag">{Math.round(zoom * 100)}%</div>
            <p className="section-copy">
              {viewportFrame.enabled
                ? "ミニビューをドラッグすると表示位置を移動できます。"
                : "キャンバス全体が表示されています。"}
            </p>
          </div>
        </div>

        <div className="canvas-panel canvas-panel--grow">
          <div className="stack-sm">
            <div className="step-badge">Info</div>
            <h2 className="section-title" style={{ fontSize: "1.15rem" }}>
              キャンバス情報
            </h2>
          </div>

          <div className="canvas-info-list">
            <div className="canvas-info-row">
              <span>接続状態</span>
              <strong className={`tag tag--${connectionState}`}>
                {connectionLabel[connectionState]}
              </strong>
            </div>
            <div className="canvas-info-row">
              <span>サイズ</span>
              <strong>
                {initialSnapshot.width} x {initialSnapshot.height}px
              </strong>
            </div>
            <div className="canvas-info-row">
              <span>パレット</span>
              <strong>
                {initialSnapshot.paletteVersion} / {palette.length}色 + 透明
              </strong>
            </div>
            <div className="canvas-info-row">
              <span>カーソル</span>
              <strong>
                {hoveredPixel ? `${hoveredPixel.x}, ${hoveredPixel.y}` : "-"}
              </strong>
            </div>
            <div className="canvas-info-row">
              <span>ズーム</span>
              <strong>{Math.round(zoom * 100)}%</strong>
            </div>
          </div>

          <p className="section-copy">{statusMessage}</p>
        </div>

        <Link
          className="button button-secondary canvas-sidebar__leave"
          href={leaveHref}
        >
          編集を終了
        </Link>
      </aside>
    </section>
  );
}
