"use client";

import Link from "next/link";
import { ArrowLeft, Info, PaletteIcon } from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useEffectEvent,
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
import { AppHeader } from "../AppHeader";
import { decodeBase64Pixels, getCanvasWebSocketUrl } from "../../lib/canvas";

type CanvasEditorProps = {
  initialSnapshot: CanvasSnapshot;
  wallName?: string | null;
  wsBase: string;
  leaveHref: string;
  referenceImageUrl?: string | null;
};

type ConnectionState = "connecting" | "open" | "closed" | "error";
type PopoverKind = "palette" | "info" | null;
type PixelPoint = { x: number; y: number };
type PointerPosition = { x: number; y: number };
type SurfaceFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
};
type ViewportFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
  enabled: boolean;
};
type PinchGesture = {
  contentLeft: number;
  contentTop: number;
  contentX: number;
  contentY: number;
  stageHeight: number;
  stageWidth: number;
  startDistance: number;
  startZoom: number;
};

const MOBILE_LAYOUT_MAX = 720;
const MOBILE_LAYOUT_QUERY = "(max-width: 720px)";
const COARSE_POINTER_QUERY = "(pointer: coarse)";
const MOBILE_CURSOR_ICON_SIZE = 30;
const MIN_ZOOM = 1;
const MAX_ZOOM = 24;

function MobileCursorPencilIcon({ size }: { size: number }) {
  return (
    <svg
      aria-hidden="true"
      className="block"
      fill="none"
      focusable="false"
      height={size}
      viewBox="0 0 30 30"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <polygon fill="#d5a46a" points="0 30 6.1 23.9 9.2 27 3.1 30" />
      <polygon fill="#1f1a14" points="0 30 3.2 26.8 4.8 28.4 2.4 30" />
      <polygon
        fill="currentColor"
        points="6.1 23.9 20.2 9.8 24.4 14 10.3 28.1"
      />
      <polygon fill="#f2e7d8" points="20.2 9.8 23.4 6.6 27.6 10.8 24.4 14" />
      <polygon fill="#e58d8a" points="23.4 6.6 27 3 30 6 26.4 9.6" />
    </svg>
  );
}

function getInitialZoom(width: number, height: number) {
  const longestEdge = Math.max(width, height);
  return Math.max(2, Math.min(12, Math.round(448 / longestEdge)));
}

function getInitialCursorPixel(width: number, height: number): PixelPoint {
  return {
    x: Math.floor((width - 1) / 2),
    y: Math.floor((height - 1) / 2),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function arePointerPositionsEqual(
  first: PointerPosition | null,
  second: PointerPosition | null,
) {
  if (!first || !second) {
    return first === second;
  }

  return first.x === second.x && first.y === second.y;
}

function areSurfaceFramesEqual(first: SurfaceFrame, second: SurfaceFrame) {
  return (
    first.left === second.left &&
    first.top === second.top &&
    first.width === second.width &&
    first.height === second.height
  );
}

function areViewportFramesEqual(first: ViewportFrame, second: ViewportFrame) {
  return (
    first.left === second.left &&
    first.top === second.top &&
    first.width === second.width &&
    first.height === second.height &&
    first.enabled === second.enabled
  );
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

  return paletteIndex === null ? null : (palette[paletteIndex] ?? null);
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

function getLinePixels(from: PixelPoint, to: PixelPoint) {
  const pixels: PixelPoint[] = [];
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

function getMidpoint(first: PointerPosition, second: PointerPosition) {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

function getDistance(first: PointerPosition, second: PointerPosition) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function shouldUseMobileCanvasLayout() {
  if (typeof window === "undefined") {
    return false;
  }

  const narrowViewport =
    window.matchMedia(MOBILE_LAYOUT_QUERY).matches ||
    window.innerWidth <= MOBILE_LAYOUT_MAX;
  const shortestScreenEdge = Math.min(
    window.screen.width,
    window.screen.height,
  );
  const narrowScreen =
    Number.isFinite(shortestScreenEdge) &&
    shortestScreenEdge > 0 &&
    shortestScreenEdge <= MOBILE_LAYOUT_MAX;
  const hasCoarsePointer =
    window.matchMedia(COARSE_POINTER_QUERY).matches ||
    navigator.maxTouchPoints > 0;

  return narrowViewport || (hasCoarsePointer && narrowScreen);
}

export function CanvasEditor({
  initialSnapshot,
  wallName,
  wsBase,
  leaveHref,
  referenceImageUrl,
}: CanvasEditorProps) {
  const editorRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
  const minimapFrameRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const dirtyPixelsRef = useRef<Array<{ x: number; y: number; color: number }>>(
    [],
  );
  const redrawQueuedRef = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);
  const pixelsRef = useRef(
    decodeSnapshotPixels(
      initialSnapshot.pixels,
      initialSnapshot.palette.length,
    ),
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
  const lastPointerPixelRef = useRef<PixelPoint | null>(null);
  const cursorPixelRef = useRef(
    getInitialCursorPixel(initialSnapshot.width, initialSnapshot.height),
  );
  const cursorFloatRef = useRef({
    x: cursorPixelRef.current.x,
    y: cursorPixelRef.current.y,
  });
  const mobileCursorViewportRef = useRef<PointerPosition | null>(null);
  const activePointersRef = useRef<Map<number, PointerPosition>>(new Map());
  const singleTouchRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);
  const pinchGestureRef = useRef<PinchGesture | null>(null);
  const paintButtonPressedRef = useRef(false);
  const ignoreNextPaintClickRef = useRef(false);

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
  const [viewportFrame, setViewportFrame] = useState<ViewportFrame>({
    left: 0,
    top: 0,
    width: 100,
    height: 100,
    enabled: false,
  });
  const [surfaceFrame, setSurfaceFrame] = useState<SurfaceFrame>(() => {
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
  const [cursorPixel, setCursorPixel] = useState<PixelPoint>(
    cursorPixelRef.current,
  );
  const [mobileCursorViewport, setMobileCursorViewport] =
    useState<PointerPosition | null>(null);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [openPopover, setOpenPopover] = useState<PopoverKind>(null);
  const [paintButtonPressed, setPaintButtonPressed] = useState(false);
  const [isTouchNavigating, setIsTouchNavigating] = useState(false);

  function commitZoomState(nextZoom: number) {
    if (zoomRef.current === nextZoom) {
      return;
    }

    zoomRef.current = nextZoom;
    setZoom(nextZoom);
  }

  function commitPanState(nextPan: PointerPosition) {
    if (panRef.current.x === nextPan.x && panRef.current.y === nextPan.y) {
      return;
    }

    panRef.current = nextPan;
    setPan(nextPan);
  }

  function setPaintButtonPressedState(nextPressed: boolean) {
    if (paintButtonPressedRef.current === nextPressed) {
      return;
    }

    paintButtonPressedRef.current = nextPressed;
    setPaintButtonPressed(nextPressed);
  }

  useEffect(() => {
    setSelectedColor((current) => {
      if (current === TRANSPARENT_PIXEL_VALUE || current <= palette.length) {
        return current;
      }

      return getDefaultSelectedColor(palette.length);
    });
  }, [palette]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncLayout = () => {
      const nextIsMobile = shouldUseMobileCanvasLayout();
      setIsMobileLayout(nextIsMobile);

      if (!nextIsMobile) {
        setOpenPopover(null);
        setPaintButtonPressedState(false);
        activePointersRef.current.clear();
        mobileCursorViewportRef.current = null;
        setMobileCursorViewport(null);
        singleTouchRef.current = null;
        pinchGestureRef.current = null;
        setIsTouchNavigating(false);
      }
    };

    syncLayout();
    window.addEventListener("resize", syncLayout);
    window.addEventListener("orientationchange", syncLayout);

    return () => {
      window.removeEventListener("resize", syncLayout);
      window.removeEventListener("orientationchange", syncLayout);
    };
  }, []);

  const drawDirtyPixels = useCallback(() => {
    if (dirtyPixelsRef.current.length === 0) {
      return;
    }

    const canvas = canvasRef.current;
    const minimapCanvas = minimapCanvasRef.current;

    if (!canvas && !minimapCanvas) {
      return;
    }

    const mainContext = canvas?.getContext("2d") ?? null;
    const minimapContext = minimapCanvas?.getContext("2d") ?? null;

    if (!mainContext && !minimapContext) {
      return;
    }

    const pixelsToDraw = [...dirtyPixelsRef.current];
    dirtyPixelsRef.current = [];

    for (const pixel of pixelsToDraw) {
      const colorString = getHexColorForPixelValue(
        pixel.color,
        paletteRef.current,
      );

      if (!colorString) {
        mainContext?.clearRect(pixel.x, pixel.y, 1, 1);
        minimapContext?.clearRect(pixel.x, pixel.y, 1, 1);
        continue;
      }

      if (mainContext) {
        mainContext.fillStyle = colorString;
        mainContext.fillRect(pixel.x, pixel.y, 1, 1);
      }

      if (minimapContext) {
        minimapContext.fillStyle = colorString;
        minimapContext.fillRect(pixel.x, pixel.y, 1, 1);
      }
    }
  }, []);

  const drawAllCanvases = useCallback(() => {
    drawDirtyPixels();

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
    requestAnimationFrame(() => {
      drawDirtyPixels();
      redrawQueuedRef.current = false;
    });
  }, [drawDirtyPixels]);

  const getViewportMetrics = useCallback(
    (nextZoom = zoomRef.current, proposedPan = panRef.current) => {
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
        navigatorEnabled: maxPanX > 0 || maxPanY > 0,
        relativeLeft,
        relativeTop,
        stageHeight,
        stageWidth,
        surfaceHeight,
        surfaceLeft,
        surfaceTop,
        surfaceWidth,
        visibleBottom,
        visibleLeft,
        visibleRight,
        visibleTop,
      };
    },
    [initialSnapshot.height, initialSnapshot.width],
  );

  const updateViewportFrameForState = useCallback(
    (nextZoom = zoomRef.current, proposedPan = panRef.current) => {
      const metrics = getViewportMetrics(nextZoom, proposedPan);

      if (!metrics) {
        return proposedPan;
      }

      const nextSurfaceFrame = {
        left: metrics.relativeLeft,
        top: metrics.relativeTop,
        width: metrics.surfaceWidth,
        height: metrics.surfaceHeight,
      };
      const nextViewportFrame = {
        left: (metrics.visibleLeft / initialSnapshot.width) * 100,
        top: (metrics.visibleTop / initialSnapshot.height) * 100,
        width:
          ((metrics.visibleRight - metrics.visibleLeft) /
            initialSnapshot.width) *
          100,
        height:
          ((metrics.visibleBottom - metrics.visibleTop) /
            initialSnapshot.height) *
          100,
        enabled: metrics.navigatorEnabled,
      };

      setSurfaceFrame((current) =>
        areSurfaceFramesEqual(current, nextSurfaceFrame)
          ? current
          : nextSurfaceFrame,
      );
      setViewportFrame((current) =>
        areViewportFramesEqual(current, nextViewportFrame)
          ? current
          : nextViewportFrame,
      );

      return metrics.clampedPan;
    },
    [getViewportMetrics, initialSnapshot.height, initialSnapshot.width],
  );

  function centerOnContentPosition(contentX: number, contentY: number) {
    const nextZoom = zoomRef.current;
    const nextPan = {
      x: (initialSnapshot.width / 2 - contentX) * nextZoom,
      y: (initialSnapshot.height / 2 - contentY) * nextZoom,
    };
    const clampedPan = updateViewportFrameForState(nextZoom, nextPan);

    commitPanState(clampedPan);
  }

  function setCursorToPixel(
    nextPixel: PixelPoint,
    shouldPaint = false,
    nextFloat?: PointerPosition,
  ) {
    const clampedPixel = {
      x: clamp(nextPixel.x, 0, initialSnapshot.width - 1),
      y: clamp(nextPixel.y, 0, initialSnapshot.height - 1),
    };
    const previousPixel = cursorPixelRef.current;

    cursorFloatRef.current = nextFloat
      ? {
          x: clamp(nextFloat.x, 0, initialSnapshot.width - 1),
          y: clamp(nextFloat.y, 0, initialSnapshot.height - 1),
        }
      : {
          x: clampedPixel.x,
          y: clampedPixel.y,
        };

    if (
      previousPixel.x === clampedPixel.x &&
      previousPixel.y === clampedPixel.y
    ) {
      return previousPixel;
    }

    cursorPixelRef.current = clampedPixel;
    setCursorPixel(clampedPixel);

    if (shouldPaint) {
      paintStroke(previousPixel, clampedPixel);
    }

    return clampedPixel;
  }

  function getMobileCursorViewportBounds(
    nextZoom = zoomRef.current,
    proposedPan = panRef.current,
  ) {
    const viewport = getViewportMetrics(nextZoom, proposedPan);

    if (!viewport) {
      return null;
    }

    return {
      viewport,
      left: clamp(viewport.relativeLeft, 0, viewport.stageWidth),
      top: clamp(viewport.relativeTop, 0, viewport.stageHeight),
      right: clamp(
        viewport.relativeLeft + viewport.surfaceWidth,
        0,
        viewport.stageWidth,
      ),
      bottom: clamp(
        viewport.relativeTop + viewport.surfaceHeight,
        0,
        viewport.stageHeight,
      ),
    };
  }

  function syncCursorFromMobileViewportPosition(
    nextViewportPosition = mobileCursorViewportRef.current,
    shouldPaint = false,
    nextZoom = zoomRef.current,
    proposedPan = panRef.current,
  ) {
    const bounds = getMobileCursorViewportBounds(nextZoom, proposedPan);

    if (!bounds) {
      return null;
    }

    const fallbackPosition = nextViewportPosition ??
      mobileCursorViewportRef.current ?? {
        x:
          bounds.viewport.relativeLeft +
          (cursorFloatRef.current.x + 0.5) * nextZoom,
        y:
          bounds.viewport.relativeTop +
          (cursorFloatRef.current.y + 0.5) * nextZoom,
      };
    const clampedViewportPosition = {
      x: clamp(fallbackPosition.x, bounds.left, bounds.right),
      y: clamp(fallbackPosition.y, bounds.top, bounds.bottom),
    };
    const nextFloat = {
      x: clamp(
        (clampedViewportPosition.x - bounds.viewport.relativeLeft) / nextZoom,
        0,
        initialSnapshot.width - 1,
      ),
      y: clamp(
        (clampedViewportPosition.y - bounds.viewport.relativeTop) / nextZoom,
        0,
        initialSnapshot.height - 1,
      ),
    };

    mobileCursorViewportRef.current = clampedViewportPosition;
    setMobileCursorViewport((current) =>
      arePointerPositionsEqual(current, clampedViewportPosition)
        ? current
        : clampedViewportPosition,
    );
    setCursorToPixel(
      {
        x: Math.floor(nextFloat.x),
        y: Math.floor(nextFloat.y),
      },
      shouldPaint,
      nextFloat,
    );

    return clampedViewportPosition;
  }

  function moveMobileCursorByScreenDelta(deltaX: number, deltaY: number) {
    const currentViewportPosition =
      mobileCursorViewportRef.current ?? syncCursorFromMobileViewportPosition();

    if (!currentViewportPosition) {
      return;
    }

    syncCursorFromMobileViewportPosition(
      {
        x: currentViewportPosition.x + deltaX,
        y: currentViewportPosition.y + deltaY,
      },
      paintButtonPressedRef.current,
    );
  }

  function paintCurrentCursor() {
    paintStroke(cursorPixelRef.current, cursorPixelRef.current);
  }

  function beginPinchGesture() {
    const pointers = [...activePointersRef.current.values()];

    if (pointers.length < 2) {
      pinchGestureRef.current = null;
      setIsTouchNavigating(false);
      return;
    }

    const first = pointers[0];
    const second = pointers[1];
    const midpoint = getMidpoint(first, second);
    const viewport = getViewportMetrics(zoomRef.current, panRef.current);

    if (!viewport) {
      return;
    }

    pinchGestureRef.current = {
      contentLeft: viewport.contentLeft,
      contentTop: viewport.contentTop,
      contentX: clamp(
        (midpoint.x - viewport.surfaceLeft) / zoomRef.current,
        0,
        initialSnapshot.width,
      ),
      contentY: clamp(
        (midpoint.y - viewport.surfaceTop) / zoomRef.current,
        0,
        initialSnapshot.height,
      ),
      stageHeight: viewport.stageHeight,
      stageWidth: viewport.stageWidth,
      startDistance: Math.max(getDistance(first, second), 1),
      startZoom: zoomRef.current,
    };
    singleTouchRef.current = null;
    setIsTouchNavigating(true);
  }

  function syncMobileGestureState() {
    const pointerEntries = [...activePointersRef.current.entries()];

    if (pointerEntries.length >= 2) {
      beginPinchGesture();
      return;
    }

    pinchGestureRef.current = null;
    setIsTouchNavigating(false);

    if (pointerEntries.length === 1) {
      const [pointerId, point] = pointerEntries[0];
      singleTouchRef.current = {
        pointerId,
        x: point.x,
        y: point.y,
      };
      return;
    }

    singleTouchRef.current = null;
  }

  function updatePinchGesture() {
    const gesture = pinchGestureRef.current;
    const pointers = [...activePointersRef.current.values()];

    if (!gesture || pointers.length < 2) {
      return;
    }

    const first = pointers[0];
    const second = pointers[1];
    const midpoint = getMidpoint(first, second);
    const scale = getDistance(first, second) / gesture.startDistance;
    const nextZoom = clamp(
      Number((gesture.startZoom * scale).toFixed(2)),
      MIN_ZOOM,
      MAX_ZOOM,
    );
    const nextSurfaceWidth = initialSnapshot.width * nextZoom;
    const nextSurfaceHeight = initialSnapshot.height * nextZoom;
    const proposedPan = {
      x:
        midpoint.x -
        gesture.contentLeft -
        (gesture.stageWidth - nextSurfaceWidth) / 2 -
        gesture.contentX * nextZoom,
      y:
        midpoint.y -
        gesture.contentTop -
        (gesture.stageHeight - nextSurfaceHeight) / 2 -
        gesture.contentY * nextZoom,
    };
    const nextPan = updateViewportFrameForState(nextZoom, proposedPan);

    commitZoomState(nextZoom);
    commitPanState(nextPan);
    syncCursorFromMobileViewportPosition(undefined, false, nextZoom, nextPan);
  }

  const handleOutsidePointerDown = useEffectEvent((event: PointerEvent) => {
    if (!toolbarRef.current?.contains(event.target as Node)) {
      setOpenPopover(null);
    }
  });

  const handleEscapeToClosePopover = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === "Escape") {
      setOpenPopover(null);
    }
  });

  useEffect(() => {
    if (!isMobileLayout || !openPopover) {
      return;
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    document.addEventListener("keydown", handleEscapeToClosePopover);

    return () => {
      document.removeEventListener(
        "pointerdown",
        handleOutsidePointerDown,
        true,
      );
      document.removeEventListener("keydown", handleEscapeToClosePopover);
    };
  }, [
    handleEscapeToClosePopover,
    handleOutsidePointerDown,
    isMobileLayout,
    openPopover,
  ]);

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
        MIN_ZOOM,
        MAX_ZOOM,
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

      commitZoomState(nextZoom);
      commitPanState(nextPan);
    };

    const syncStageLayout = () => {
      const nextPan = updateViewportFrameForState();

      if (nextPan.x !== panRef.current.x || nextPan.y !== panRef.current.y) {
        commitPanState(nextPan);
      }
    };

    stage.addEventListener("wheel", handleWheel, { passive: false });
    syncStageLayout();

    const resizeObserver = new ResizeObserver(syncStageLayout);
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
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (error) {
        console.error("Failed to parse JSON:", error);
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
        dirtyPixelsRef.current = [];
        parsedPaletteRef.current = parsePaletteColors(message.palette);
        setPalette(message.palette);
        drawAllCanvases();
        updateViewportFrameForState();
        setStatusMessage(`${wallName ?? "キャンバス"} と同期しました。`);
        return;
      }

      if (message.type === "pixel:applied") {
        const { x, y } = message;
        const color = normalizePixelValue(
          message.color,
          paletteRef.current.length,
        );
        const index = y * initialSnapshot.width + x;

        if (index >= 0 && index < pixelsRef.current.length) {
          pixelsRef.current[index] = color;
        }

        dirtyPixelsRef.current.push({ x, y, color });
        requestRedraw();
        return;
      }

      if (message.type === "pixels:applied") {
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
    drawAllCanvases,
    initialSnapshot.canvasId,
    initialSnapshot.width,
    requestRedraw,
    updateViewportFrameForState,
    wallName,
    wsBase,
  ]);

  useEffect(() => {
    if (!isMobileLayout) {
      return;
    }

    syncCursorFromMobileViewportPosition();
  }, [
    isMobileLayout,
    surfaceFrame.height,
    surfaceFrame.left,
    surfaceFrame.top,
    surfaceFrame.width,
  ]);

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

  function applyPixelLocally(x: number, y: number, color: number) {
    const index = y * initialSnapshot.width + x;
    const normalizedColor = normalizePixelValue(
      color,
      paletteRef.current.length,
    );

    if (pixelsRef.current[index] === normalizedColor) {
      return;
    }

    pixelsRef.current[index] = normalizedColor;
    dirtyPixelsRef.current.push({ x, y, color: normalizedColor });
    requestRedraw();
  }

  function paintStroke(from: PixelPoint, to: PixelPoint) {
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
          type: "pixels:set",
          canvasId: initialSnapshot.canvasId,
          pixels: pixelsForMessage,
        }),
      );
    }
  }

  function startDesktopPanning(event: ReactPointerEvent<HTMLCanvasElement>) {
    panStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: panRef.current.x,
      panY: panRef.current.y,
    };
    lastPointerPixelRef.current = null;
    setIsPanning(true);
  }

  function handleDesktopPointerDown(
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    if (event.button === 1 || event.button === 2 || spacePressedRef.current) {
      startDesktopPanning(event);
      setCursorToPixel(getPixelPosition(event));
      return;
    }

    if (event.button !== 0) {
      return;
    }

    const position = getPixelPosition(event);
    setCursorToPixel(position);
    lastPointerPixelRef.current = position;
    paintStroke(position, position);
  }

  function handleDesktopPointerMove(
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) {
    const position = getPixelPosition(event);
    setCursorToPixel(position);

    if (panStartRef.current) {
      const nextPan = {
        x: panStartRef.current.panX + (event.clientX - panStartRef.current.x),
        y: panStartRef.current.panY + (event.clientY - panStartRef.current.y),
      };
      const clampedPan = updateViewportFrameForState(zoomRef.current, nextPan);
      commitPanState(clampedPan);
      return;
    }

    if ((event.buttons & 1) !== 1) {
      lastPointerPixelRef.current = position;
      return;
    }

    paintStroke(lastPointerPixelRef.current ?? position, position);
    lastPointerPixelRef.current = position;
  }

  function handleMobilePointerDown(
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    syncMobileGestureState();
  }

  function handleMobilePointerMove(
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) {
    if (!activePointersRef.current.has(event.pointerId)) {
      return;
    }

    activePointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (activePointersRef.current.size >= 2) {
      updatePinchGesture();
      return;
    }

    if (
      !singleTouchRef.current ||
      singleTouchRef.current.pointerId !== event.pointerId
    ) {
      singleTouchRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
      return;
    }

    moveMobileCursorByScreenDelta(
      event.clientX - singleTouchRef.current.x,
      event.clientY - singleTouchRef.current.y,
    );
    singleTouchRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (isMobileLayout) {
      handleMobilePointerDown(event);
      return;
    }

    handleDesktopPointerDown(event);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (isMobileLayout) {
      handleMobilePointerMove(event);
      return;
    }

    handleDesktopPointerMove(event);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (isMobileLayout) {
      activePointersRef.current.delete(event.pointerId);
      syncMobileGestureState();
      return;
    }

    panStartRef.current = null;
    lastPointerPixelRef.current = null;
    setIsPanning(false);
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

  function togglePopover(nextPopover: Exclude<PopoverKind, null>) {
    setOpenPopover((current) => (current === nextPopover ? null : nextPopover));
  }

  function handlePaintButtonPointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    ignoreNextPaintClickRef.current = true;
    setPaintButtonPressedState(true);
    paintCurrentCursor();
  }

  function handlePaintButtonPointerUp(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setPaintButtonPressedState(false);
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
      : (selectedColorHex ?? `色 ${selectedColor}`);
  const stageIsPannable = isPanning || spacePressed || isTouchNavigating;
  const gridPatternId = `canvas-grid-${initialSnapshot.canvasId}`;
  const mobileCursorBadgePosition = isMobileLayout
    ? mobileCursorViewport
    : null;

  function renderPaletteContent(compact = false) {
    const paletteGridClassName = compact
      ? "grid grid-cols-6 gap-1.5 select-none"
      : "grid grid-cols-4 select-none";
    const selectedSwatchShadow =
      "inset 0 0 0 2px var(--color-selected), inset 0 0 0 4px #fff";
    const swatchClassName = compact
      ? "relative aspect-square w-full cursor-pointer select-none border-0 shadow-[inset_0_0_0_1px_rgba(31,26,20,0.12)]"
      : "relative min-h-12 cursor-pointer select-none border-0 shadow-[inset_0_0_0_1px_rgba(31,26,20,0.12)] hover:shadow-[inset_0_0_0_2px_rgba(31,26,20,0.64)] focus-visible:shadow-[inset_0_0_0_2px_rgba(31,26,20,0.64)] focus-visible:outline-none";

    return (
      <>
        <h2 className="section-title text-lg select-none">パレット</h2>

        <div className={paletteGridClassName}>
          {palette.map((color, index) => (
            <button
              key={`${index}-${color}`}
              aria-label={`color ${index + 1}`}
              className={swatchClassName}
              onClick={() => setSelectedColor(index + 1)}
              style={{
                backgroundColor: color,
                boxShadow:
                  selectedColor === index + 1
                    ? selectedSwatchShadow
                    : undefined,
              }}
              type="button"
            />
          ))}
          <button
            aria-label="transparent"
            className={`transparent-swatch ${swatchClassName}`}
            onClick={() => setSelectedColor(TRANSPARENT_PIXEL_VALUE)}
            style={{
              boxShadow:
                selectedColor === TRANSPARENT_PIXEL_VALUE
                  ? selectedSwatchShadow
                  : undefined,
            }}
            type="button"
          />
        </div>
      </>
    );
  }

  function renderInfoContent() {
    return (
      <>
        <h2 className="section-title text-lg select-none">キャンバス情報</h2>

        <div className="grid gap-2.5 select-none">
          <div className="flex items-center justify-between gap-3 select-none border border-border bg-bg-elevated px-3 py-2">
            <span>接続状態</span>
            <strong className={`tag tag--${connectionState}`}>
              {connectionLabel[connectionState]}
            </strong>
          </div>
          <div className="flex items-center justify-between gap-3 select-none border border-border bg-bg-elevated px-3 py-2">
            <span>サイズ</span>
            <strong>
              {initialSnapshot.width} x {initialSnapshot.height}px
            </strong>
          </div>
        </div>

        <p className="section-copy select-none">{statusMessage}</p>
      </>
    );
  }

  function renderStage() {
    return (
      <div
        className={`relative h-full min-h-0 select-none overflow-hidden bg-gray-400 ${stageIsPannable ? " cursor-grab" : " cursor-crosshair"}`}
        ref={stageRef}
      >
        <div
          className="absolute block select-none overflow-hidden bg-[#fff8f0] shadow-[0_28px_60px_rgba(50,33,15,0.16)]"
          style={{
            left: surfaceFrame.left,
            top: surfaceFrame.top,
            width: surfaceFrame.width,
            height: surfaceFrame.height,
          }}
        >
          <div
            className="absolute inset-0 z-0 bg-center bg-cover bg-no-repeat opacity-[0.18] pointer-events-none"
            style={referenceBackgroundStyle}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 z-2 pointer-events-none"
          >
            <svg
              className="block h-full w-full"
              preserveAspectRatio="none"
              shapeRendering="crispEdges"
              viewBox={`0 0 ${initialSnapshot.width} ${initialSnapshot.height}`}
              style={{
                opacity: zoom >= 6 ? 0.72 : zoom >= 3 ? 0.42 : 0.22,
              }}
            >
              <defs>
                <pattern
                  height="1"
                  id={gridPatternId}
                  patternUnits="userSpaceOnUse"
                  width="1"
                >
                  <path
                    d="M 1 0 L 0 0 0 1"
                    fill="none"
                    shapeRendering="crispEdges"
                    stroke="rgba(31, 26, 20, 0.16)"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                </pattern>
              </defs>
              <rect
                fill={`url(#${gridPatternId})`}
                height={initialSnapshot.height}
                width={initialSnapshot.width}
              />
            </svg>
          </div>
          <canvas
            className={
              stageIsPannable
                ? "relative z-1 block select-none touch-none [image-rendering:pixelated] cursor-grab"
                : "relative z-1 block select-none touch-none [image-rendering:pixelated] cursor-crosshair"
            }
            height={initialSnapshot.height}
            onContextMenu={(event) => event.preventDefault()}
            onPointerDown={handlePointerDown}
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
          <div
            className="pointer-events-none absolute left-0 top-0 z-[3] border border-[rgba(182,76,45,0.94)] bg-[rgba(182,76,45,0.18)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.65)]"
            style={{
              width: zoom,
              height: zoom,
              transform: `translate(${cursorPixel.x * zoom}px, ${cursorPixel.y * zoom}px)`,
            }}
          />
        </div>
        {mobileCursorBadgePosition ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-4 select-none text-primary leading-0 drop-shadow-[0_6px_12px_rgba(65,38,13,0.18)]"
            style={{
              left: mobileCursorBadgePosition.x,
              top: mobileCursorBadgePosition.y,
              transform: `translateY(-${MOBILE_CURSOR_ICON_SIZE}px)`,
            }}
          >
            <MobileCursorPencilIcon size={MOBILE_CURSOR_ICON_SIZE} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <section
      className={`h-full${isMobileLayout ? " overflow-y-auto select-none" : ""}`}
      ref={editorRef}
    >
      <AppHeader
        leading={
          <Link
            aria-label="マップへ戻る"
            className="site-header__control site-header__control--icon select-none"
            href={leaveHref}
          >
            <ArrowLeft size={20} weight="bold" />
          </Link>
        }
        title={
          <div className="site-header__title select-none">
            {wallName ?? "ライブキャンバス"}
          </div>
        }
      />

      {isMobileLayout ? (
        <div className="grid min-h-0 select-none content-start gap-3 pb-4">
          <div className="grid min-h-0 w-full select-none aspect-square self-start">
            {renderStage()}
          </div>

          <div className="select-none px-2">
            <div
              className="relative grid grid-cols-2 gap-3 select-none"
              ref={toolbarRef}
            >
              <div className="relative select-none">
                <button
                  aria-expanded={openPopover === "palette"}
                  aria-haspopup="dialog"
                  className="select-none inline-flex min-h-13 w-full items-center justify-center gap-2 border border-border bg-bg-elevated px-3.5 text-fg shadow-[var(--shadow-elevated)]"
                  onClick={() => togglePopover("palette")}
                  type="button"
                >
                  <span
                    className={`size-4 border border-[rgba(31,26,20,0.14)] bg-bg-elevated${selectedColor === TRANSPARENT_PIXEL_VALUE ? " transparent-swatch" : ""}`}
                    style={
                      selectedColorHex
                        ? { backgroundColor: selectedColorHex }
                        : undefined
                    }
                  />
                  <PaletteIcon size={18} weight="bold" />
                  <span>パレット</span>
                </button>

                {openPopover === "palette" ? (
                  <div
                    className="absolute bottom-full left-0 z-[30] mb-3 w-[min(320px,calc(100vw-24px))] select-none"
                    role="dialog"
                  >
                    <div className="relative grid gap-4 select-none border border-border bg-[linear-gradient(180deg,rgba(255,252,245,0.98),rgba(247,239,225,0.98))] p-4 shadow-[0_24px_48px_rgba(31,26,20,0.18)]">
                      {renderPaletteContent(true)}
                      <div className="absolute -bottom-2 left-7 size-4 rotate-45 border-b border-r border-border bg-[rgba(247,239,225,0.98)]" />
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="relative select-none">
                <button
                  aria-expanded={openPopover === "info"}
                  aria-haspopup="dialog"
                  className="select-none inline-flex min-h-13 w-full items-center justify-center gap-2 border border-border bg-bg-elevated px-3.5 text-fg shadow-[var(--shadow-elevated)]"
                  onClick={() => togglePopover("info")}
                  type="button"
                >
                  <Info size={18} weight="bold" />
                  <span>詳細</span>
                </button>

                {openPopover === "info" ? (
                  <div
                    className="absolute right-0 bottom-full z-[30] mb-3 w-[min(320px,calc(100vw-24px))] select-none"
                    role="dialog"
                  >
                    <div className="relative grid gap-4 select-none border border-border bg-[linear-gradient(180deg,rgba(255,252,245,0.98),rgba(247,239,225,0.98))] p-4 shadow-[0_24px_48px_rgba(31,26,20,0.18)]">
                      {renderInfoContent()}
                      <div className="absolute -bottom-2 right-7 size-4 rotate-45 border-b border-r border-border bg-[rgba(247,239,225,0.98)]" />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div
              className="select-none"
              style={{
                paddingBottom:
                  "calc(8px + max(0px, env(safe-area-inset-bottom)))",
              }}
            >
              <button
                className={`mt-4 py-5 w-full text-xl font-bold bg-primary tracking-wide rounded-lg border-2 border-primary-active select-none text-fg-inverse ${paintButtonPressed ? " translate-y-2" : "shadow-[0_8px_0_0_var(--color-primary-active)]"}`}
                onClick={() => {
                  if (ignoreNextPaintClickRef.current) {
                    ignoreNextPaintClickRef.current = false;
                    return;
                  }

                  paintCurrentCursor();
                }}
                onLostPointerCapture={() => setPaintButtonPressedState(false)}
                onPointerCancel={handlePaintButtonPointerUp}
                onPointerDown={handlePaintButtonPointerDown}
                onPointerUp={handlePaintButtonPointerUp}
                type="button"
              >
                CLICK
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 gap-[18px] max-[1200px]:grid-cols-[280px_minmax(0,1fr)_240px] max-[960px]:grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)_280px]">
          <aside className="grid min-h-0 gap-3.5">
            <div className="grid min-h-0 content-start gap-4 overflow-auto border border-border bg-bg-elevated p-5 shadow-[var(--shadow-elevated)]">
              {renderPaletteContent()}
            </div>
          </aside>

          {renderStage()}

          <aside className="grid min-h-0 gap-3.5">
            <div
              className={
                viewportFrame.enabled
                  ? "relative overflow-hidden border border-border bg-[#fff8f0] cursor-grab"
                  : "relative overflow-hidden border border-border bg-[#fff8f0] cursor-default"
              }
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
                background:
                  "linear-gradient(135deg, var(--color-bg-elevated), rgba(245, 236, 220, 0.94)), #fff8f0",
              }}
            >
              <div
                className="absolute inset-0 z-0 bg-center bg-cover bg-no-repeat opacity-[0.18] pointer-events-none"
                style={referenceBackgroundStyle}
              />
              <canvas
                className="select-none relative z-1 block h-full w-full [image-rendering:pixelated]"
                height={initialSnapshot.height}
                ref={minimapCanvasRef}
                width={initialSnapshot.width}
              />
              {viewportFrame.enabled ? (
                <div
                  className="pointer-events-none absolute z-2 min-h-3 min-w-3 border-2 border-primary-active shadow-[0_0_0_9999px_rgba(255,255,255,0.08)]"
                  style={{
                    left: `${viewportFrame.left}%`,
                    top: `${viewportFrame.top}%`,
                    width: `${viewportFrame.width}%`,
                    height: `${viewportFrame.height}%`,
                  }}
                />
              ) : null}
            </div>

            <div className="grid min-h-0 content-start gap-4 overflow-auto border border-border bg-bg-elevated p-5 shadow-[var(--shadow-elevated)]">
              {renderInfoContent()}
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
