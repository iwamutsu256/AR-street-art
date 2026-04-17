"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { CanvasRealtimeMessage, CanvasSnapshot } from "@street-art/shared";
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

function drawSnapshotToCanvas(
  canvas: HTMLCanvasElement,
  pixels: Uint8Array,
  width: number,
  height: number,
  palette: string[],
) {
  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  const imageData = context.createImageData(width, height);

  for (let index = 0; index < pixels.length; index += 1) {
    const color = palette[pixels[index]] ?? "#000000";
    const offset = index * 4;
    imageData.data[offset] = Number.parseInt(color.slice(1, 3), 16);
    imageData.data[offset + 1] = Number.parseInt(color.slice(3, 5), 16);
    imageData.data[offset + 2] = Number.parseInt(color.slice(5, 7), 16);
    imageData.data[offset + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
}

function drawPixel(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  paletteIndex: number,
  palette: string[],
) {
  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  context.fillStyle = palette[paletteIndex] ?? "#000000";
  context.fillRect(x, y, 1, 1);
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
  const socketRef = useRef<WebSocket | null>(null);
  const pixelsRef = useRef(decodeBase64Pixels(initialSnapshot.pixels));
  const paletteRef = useRef(initialSnapshot.palette);
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

  const [selectedColor, setSelectedColor] = useState(1);
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
  });

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  function drawAllCanvases() {
    if (canvasRef.current) {
      drawSnapshotToCanvas(
        canvasRef.current,
        pixelsRef.current,
        initialSnapshot.width,
        initialSnapshot.height,
        paletteRef.current,
      );
    }

    if (minimapCanvasRef.current) {
      drawSnapshotToCanvas(
        minimapCanvasRef.current,
        pixelsRef.current,
        initialSnapshot.width,
        initialSnapshot.height,
        paletteRef.current,
      );
    }
  }

  function updateViewportFrameForState(
    nextZoom = zoomRef.current,
    nextPan = panRef.current,
  ) {
    const stage = stageRef.current;

    if (!stage) {
      return;
    }

    const stageRect = stage.getBoundingClientRect();
    const surfaceWidth = initialSnapshot.width * nextZoom;
    const surfaceHeight = initialSnapshot.height * nextZoom;
    const surfaceLeft =
      stageRect.left + (stageRect.width - surfaceWidth) / 2 + nextPan.x;
    const surfaceTop =
      stageRect.top + (stageRect.height - surfaceHeight) / 2 + nextPan.y;

    const visibleLeft = clamp(
      (stageRect.left - surfaceLeft) / nextZoom,
      0,
      initialSnapshot.width,
    );
    const visibleTop = clamp(
      (stageRect.top - surfaceTop) / nextZoom,
      0,
      initialSnapshot.height,
    );
    const visibleRight = clamp(
      (stageRect.right - surfaceLeft) / nextZoom,
      0,
      initialSnapshot.width,
    );
    const visibleBottom = clamp(
      (stageRect.bottom - surfaceTop) / nextZoom,
      0,
      initialSnapshot.height,
    );

    setViewportFrame({
      left: (visibleLeft / initialSnapshot.width) * 100,
      top: (visibleTop / initialSnapshot.height) * 100,
      width: ((visibleRight - visibleLeft) / initialSnapshot.width) * 100,
      height: ((visibleBottom - visibleTop) / initialSnapshot.height) * 100,
    });
  }

  function centerOnContentPosition(contentX: number, contentY: number) {
    const nextZoom = zoomRef.current;
    const nextPan = {
      x: (initialSnapshot.width / 2 - contentX) * nextZoom,
      y: (initialSnapshot.height / 2 - contentY) * nextZoom,
    };

    setPan(nextPan);
    panRef.current = nextPan;
    updateViewportFrameForState(nextZoom, nextPan);
  }

  useEffect(() => {
    drawAllCanvases();
  }, [initialSnapshot.height, initialSnapshot.width]);

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

      const stageRect = stage.getBoundingClientRect();
      const currentZoom = zoomRef.current;
      const nextZoom = clamp(
        Number((currentZoom + (event.deltaY > 0 ? -0.5 : 0.5)).toFixed(2)),
        1,
        24,
      );

      if (nextZoom === currentZoom) {
        return;
      }

      const surfaceWidth = initialSnapshot.width * currentZoom;
      const surfaceHeight = initialSnapshot.height * currentZoom;
      const surfaceLeft =
        stageRect.left +
        (stageRect.width - surfaceWidth) / 2 +
        panRef.current.x;
      const surfaceTop =
        stageRect.top +
        (stageRect.height - surfaceHeight) / 2 +
        panRef.current.y;
      const contentX = clamp(
        (event.clientX - surfaceLeft) / currentZoom,
        0,
        initialSnapshot.width,
      );
      const contentY = clamp(
        (event.clientY - surfaceTop) / currentZoom,
        0,
        initialSnapshot.height,
      );
      const nextSurfaceWidth = initialSnapshot.width * nextZoom;
      const nextSurfaceHeight = initialSnapshot.height * nextZoom;
      const nextPan = {
        x:
          event.clientX -
          stageRect.left -
          (stageRect.width - nextSurfaceWidth) / 2 -
          contentX * nextZoom,
        y:
          event.clientY -
          stageRect.top -
          (stageRect.height - nextSurfaceHeight) / 2 -
          contentY * nextZoom,
      };

      setZoom(nextZoom);
      setPan(nextPan);
      zoomRef.current = nextZoom;
      panRef.current = nextPan;
      updateViewportFrameForState(nextZoom, nextPan);
    };

    stage.addEventListener("wheel", handleWheel, { passive: false });

    const resizeObserver = new ResizeObserver(() => {
      updateViewportFrameForState();
    });
    resizeObserver.observe(stage);

    return () => {
      stage.removeEventListener("wheel", handleWheel);
      resizeObserver.disconnect();
    };
  }, [initialSnapshot.height, initialSnapshot.width]);

  useEffect(() => {
    const socket = new WebSocket(
      getCanvasWebSocketUrl(initialSnapshot.canvasId, wsBase),
    );
    socketRef.current = socket;
    setConnectionState("connecting");
    setStatusMessage("キャンバスに接続しています。");

    const handleMessage = (event: MessageEvent<string>) => {
      let message: CanvasRealtimeMessage;

      try {
        message = JSON.parse(event.data) as CanvasRealtimeMessage;
      } catch {
        setStatusMessage("不明なメッセージを受信しました。");
        return;
      }

      if (message.type === "canvas:snapshot") {
        pixelsRef.current = decodeBase64Pixels(message.pixels);
        paletteRef.current = message.palette;
        setPalette(message.palette);
        drawAllCanvases();
        updateViewportFrameForState();

        setStatusMessage(`${wallName ?? "キャンバス"} と同期しました。`);
        return;
      }

      if (message.type === "pixel:applied") {
        const index = message.y * initialSnapshot.width + message.x;
        pixelsRef.current[index] = message.color;

        if (canvasRef.current) {
          drawPixel(
            canvasRef.current,
            message.x,
            message.y,
            message.color,
            paletteRef.current,
          );
        }

        if (minimapCanvasRef.current) {
          drawPixel(
            minimapCanvasRef.current,
            message.x,
            message.y,
            message.color,
            paletteRef.current,
          );
        }

        return;
      }

      setStatusMessage(message.message);
    };

    socket.addEventListener("open", () => {
      setConnectionState("open");
      setStatusMessage("リアルタイム編集が有効です。");
    });

    socket.addEventListener("message", handleMessage);

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

    return () => {
      socket.removeEventListener("message", handleMessage);
      socket.close();
      socketRef.current = null;
    };
  }, [
    initialSnapshot.canvasId,
    initialSnapshot.height,
    initialSnapshot.width,
    wallName,
    wsBase,
  ]);

  useEffect(() => {
    updateViewportFrameForState(zoom, pan);
  }, [pan, zoom, initialSnapshot.height, initialSnapshot.width]);

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

  function paintPixel(x: number, y: number) {
    if (
      socketRef.current?.readyState !== WebSocket.OPEN ||
      !canvasRef.current
    ) {
      return;
    }

    const index = y * initialSnapshot.width + x;

    if (pixelsRef.current[index] === selectedColor) {
      return;
    }

    pixelsRef.current[index] = selectedColor;
    drawPixel(canvasRef.current, x, y, selectedColor, paletteRef.current);

    if (minimapCanvasRef.current) {
      drawPixel(
        minimapCanvasRef.current,
        x,
        y,
        selectedColor,
        paletteRef.current,
      );
    }

    socketRef.current.send(
      JSON.stringify({
        type: "pixel:set",
        canvasId: initialSnapshot.canvasId,
        x,
        y,
        color: selectedColor,
      }),
    );
  }

  function paintStroke(
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) {
    for (const pixel of getLinePixels(from, to)) {
      paintPixel(pixel.x, pixel.y);
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
      setPan(nextPan);
      panRef.current = nextPan;
      updateViewportFrameForState(zoomRef.current, nextPan);
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
              32 colors
            </h2>
            <div className="canvas-selected-color">
              <span>選択中</span>
              <strong>#{selectedColor}</strong>
              <i style={{ backgroundColor: palette[selectedColor] }} />
            </div>
          </div>

          <div className="palette-grid">
            {palette.map((color, index) => (
              <button
                key={color}
                aria-label={`color ${index + 1}`}
                className={`palette-swatch${selectedColor === index ? " is-selected" : ""}`}
                onClick={() => setSelectedColor(index)}
                style={{ backgroundColor: color }}
                type="button"
              >
                <span>{index}</span>
              </button>
            ))}
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
              transform: `translate(${pan.x}px, ${pan.y}px)`,
              width: initialSnapshot.width * zoom,
              height: initialSnapshot.height * zoom,
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
                width: initialSnapshot.width * zoom,
                height: initialSnapshot.height * zoom,
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
            className="canvas-minimap"
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              handleMinimapNavigate(event);
            }}
            onPointerMove={(event) => {
              if ((event.buttons & 1) !== 1) {
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
            <div
              className="canvas-minimap__viewport"
              style={{
                left: `${viewportFrame.left}%`,
                top: `${viewportFrame.top}%`,
                width: `${viewportFrame.width}%`,
                height: `${viewportFrame.height}%`,
              }}
            />
          </div>

          <div className="canvas-view-controls">
            <div className="tag">{Math.round(zoom * 100)}%</div>
            <p className="section-copy">
              ミニビューをドラッグすると表示位置を移動できます。
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
              <strong>{initialSnapshot.paletteVersion}</strong>
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
