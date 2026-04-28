"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { WallDetail, WallSummary } from "@street-art/shared";
import { formatCoordinate } from "../../lib/walls";
import { Spinner } from "../Spinner";
import {
  FrameCornersIcon,
  UsersIcon,
  PaintBrushBroadIcon,
  CubeFocusIcon,
  CaretRightIcon,
} from "@phosphor-icons/react";

type LocationValue = {
  latitude: number;
  longitude: number;
};

type InitialView = {
  center: LocationValue;
  source: "browser" | "ip" | "default";
  zoom: number;
};

type WallMapProps = {
  mapTilerKey: string;
};

type MapTilerGeolocationResponse = {
  latitude: number;
  longitude: number;
};

const DEFAULT_CENTER: LocationValue = {
  latitude: 35.691519,
  longitude: 139.696956,
};

const LOCATION_JUMP_ZOOM = 8;
const INITIAL_REGION_ZOOM = 7;
const FOCUSED_WALL_ZOOM = 15;
const WALL_MARKER_BASE_CLASS_NAME =
  "group grid h-[42px] w-9 place-items-center border-0 bg-transparent p-0";
const WALL_MARKER_DOT_BASE_CLASS_NAME =
  "block h-6 w-6 rotate-[-45deg] rounded-[50%_50%_50%_0] border-[3px] border-fg-inverse/95 bg-primary shadow-[var(--shadow-marker)] transition duration-150 group-hover:scale-[1.12] group-hover:bg-primary-active group-focus-visible:scale-[1.12] group-focus-visible:bg-primary-active";
const WALL_MARKER_DOT_SELECTED_CLASS_NAME = "scale-[1.12] bg-primary-active";

function toggleWallMarkerSelected(element: HTMLElement, isSelected: boolean) {
  const dot = element.firstElementChild;

  if (!(dot instanceof HTMLElement)) {
    return;
  }

  for (const className of WALL_MARKER_DOT_SELECTED_CLASS_NAME.split(" ")) {
    dot.classList.toggle(className, isSelected);
  }
}

function normalizeLocation(latitude: number, longitude: number): LocationValue {
  return {
    latitude: Number(formatCoordinate(latitude)),
    longitude: Number(formatCoordinate(longitude)),
  };
}

function getBrowserLocation() {
  return new Promise<LocationValue>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("geolocation unavailable"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve(
          normalizeLocation(
            position.coords.latitude,
            position.coords.longitude,
          ),
        );
      },
      reject,
      {
        enableHighAccuracy: true,
        maximumAge: 5_000,
        timeout: 10_000,
      },
    );
  });
}

async function getApproximateIpLocation(mapTilerKey: string) {
  const response = await fetch(
    `https://api.maptiler.com/geolocation/ip.json?key=${mapTilerKey}`,
  );

  if (!response.ok) {
    throw new Error("IP location unavailable");
  }

  const data = (await response.json()) as MapTilerGeolocationResponse;

  if (!Number.isFinite(data.latitude) || !Number.isFinite(data.longitude)) {
    throw new Error("IP location invalid");
  }

  return normalizeLocation(data.latitude, data.longitude);
}

function createWallMarkerElement(wall: WallSummary) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = WALL_MARKER_BASE_CLASS_NAME;
  button.setAttribute("aria-label", `${wall.name} の詳細を表示`);

  const dot = document.createElement("span");
  dot.className = WALL_MARKER_DOT_BASE_CLASS_NAME;
  button.appendChild(dot);

  return button;
}

function createUserLocationElement() {
  const element = document.createElement("div");
  element.className =
    "relative block h-[18px] w-[18px] rounded-full border-[3px] border-fg-inverse bg-location shadow-[var(--shadow-marker-location)] after:absolute after:inset-[-10px] after:rounded-full after:bg-location/16 after:content-['']";
  element.setAttribute("aria-label", "現在地");
  return element;
}

function CurrentLocationIcon() {
  return (
    <svg aria-hidden="true" height="20" viewBox="0 0 24 24" width="20">
      <path
        d="M12 21.2 5.4 4.3 21.7 10.9l-7.1 2.5L12 21.2Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18">
      <path
        d="m6 6 12 12M18 6 6 18"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function WallMap({ mapTilerKey }: WallMapProps) {
  const searchParams = useSearchParams();
  const focusWallId = searchParams.get("focusWallId");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const wallsRef = useRef<WallSummary[]>([]);
  const selectedWallIdRef = useRef<string | null>(null);
  const detailRequestRef = useRef(0);
  const appliedFocusWallIdRef = useRef<string | null>(null);
  const [initialView, setInitialView] = useState<InitialView | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [wallFetchError, setWallFetchError] = useState<string | null>(null);
  const [wallsLoaded, setWallsLoaded] = useState(false);
  const [userLocation, setUserLocation] = useState<LocationValue | null>(null);
  const [selectedSummary, setSelectedSummary] = useState<WallSummary | null>(
    null,
  );
  const [selectedDetail, setSelectedDetail] = useState<WallDetail | null>(null);
  const [detailStatus, setDetailStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");

  async function fetchWallDetail(wall: WallSummary) {
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    setSelectedSummary(wall);
    setSelectedDetail(null);
    setDetailStatus("loading");

    try {
      const response = await fetch(`/api/walls/${encodeURIComponent(wall.id)}`);

      if (!response.ok) {
        throw new Error("wall detail unavailable");
      }

      const detail = (await response.json()) as WallDetail;

      if (detailRequestRef.current !== requestId) {
        return;
      }

      setSelectedDetail(detail);
      setDetailStatus("idle");
    } catch {
      if (detailRequestRef.current !== requestId) {
        return;
      }

      setDetailStatus("error");
    }
  }

  const syncVisibleWallMarkers = useEffectEvent(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    const bounds = map.getBounds();
    const visibleWalls = wallsRef.current.filter((wall) =>
      bounds.contains([wall.longitude, wall.latitude]),
    );
    const visibleIds = new Set(visibleWalls.map((wall) => wall.id));

    for (const [wallId, marker] of markersRef.current) {
      if (!visibleIds.has(wallId)) {
        marker.remove();
        markersRef.current.delete(wallId);
      }
    }

    for (const wall of visibleWalls) {
      if (markersRef.current.has(wall.id)) {
        continue;
      }

      const element = createWallMarkerElement(wall);
      toggleWallMarkerSelected(element, selectedWallIdRef.current === wall.id);
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        void fetchWallDetail(wall);
      });

      const marker = new maplibregl.Marker({
        anchor: "bottom",
        element,
      })
        .setLngLat([wall.longitude, wall.latitude])
        .addTo(map);

      markersRef.current.set(wall.id, marker);
    }
  });

  useEffect(() => {
    if (!mapTilerKey) {
      return;
    }

    let cancelled = false;

    async function resolveInitialView() {
      try {
        const location = await getBrowserLocation();

        if (cancelled) {
          return;
        }

        setUserLocation(location);
        setInitialView({
          center: location,
          source: "browser",
          zoom: LOCATION_JUMP_ZOOM,
        });
        return;
      } catch {
        // Fall through to MapTiler's approximate IP location.
      }

      try {
        const location = await getApproximateIpLocation(mapTilerKey);

        if (cancelled) {
          return;
        }

        setInitialView({
          center: location,
          source: "ip",
          zoom: LOCATION_JUMP_ZOOM,
        });
        return;
      } catch {
        // Fall through to the project default center.
      }

      if (!cancelled) {
        setInitialView({
          center: DEFAULT_CENTER,
          source: "default",
          zoom: INITIAL_REGION_ZOOM,
        });
      }
    }

    void resolveInitialView();

    return () => {
      cancelled = true;
    };
  }, [mapTilerKey]);

  useEffect(() => {
    if (!mapTilerKey) {
      return;
    }

    const controller = new AbortController();
    setWallsLoaded(false);

    async function loadWalls() {
      try {
        const response = await fetch("/api/walls", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("wall list unavailable");
        }

        const walls = (await response.json()) as WallSummary[];
        wallsRef.current = walls;
        setWallsLoaded(true);
        setWallFetchError(null);
        syncVisibleWallMarkers();
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }

        setWallsLoaded(false);
        setWallFetchError("壁データを取得できませんでした。");
      }
    }

    void loadWalls();

    return () => {
      controller.abort();
    };
  }, [mapTilerKey]);

  useEffect(() => {
    if (!containerRef.current || !initialView || !mapTilerKey) {
      return;
    }

    const map = new maplibregl.Map({
      center: [initialView.center.longitude, initialView.center.latitude],
      container: containerRef.current,
      style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${mapTilerKey}`,
      zoom: initialView.zoom,
    });

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    map.on("load", () => {
      setMapError(null);
      setMapReady(true);
      map.resize();
      syncVisibleWallMarkers();
    });
    map.on("moveend", () => {
      syncVisibleWallMarkers();
    });
    map.on("error", () => {
      setMapError("地図タイルを読み込めませんでした。");
    });

    mapRef.current = map;

    return () => {
      for (const marker of markersRef.current.values()) {
        marker.remove();
      }
      markersRef.current.clear();
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [initialView, mapTilerKey]);

  useEffect(() => {
    if (
      !mapTilerKey ||
      initialView?.source !== "browser" ||
      !navigator.geolocation
    ) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserLocation(
          normalizeLocation(
            position.coords.latitude,
            position.coords.longitude,
          ),
        );
      },
      () => {},
      {
        enableHighAccuracy: true,
        maximumAge: 5_000,
      },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [initialView?.source, mapTilerKey]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map || !userLocation) {
      return;
    }

    if (!userMarkerRef.current) {
      userMarkerRef.current = new maplibregl.Marker({
        element: createUserLocationElement(),
      })
        .setLngLat([userLocation.longitude, userLocation.latitude])
        .addTo(map);
      return;
    }

    userMarkerRef.current.setLngLat([
      userLocation.longitude,
      userLocation.latitude,
    ]);
  }, [mapReady, userLocation]);

  useEffect(() => {
    selectedWallIdRef.current = selectedSummary?.id ?? null;

    for (const [wallId, marker] of markersRef.current) {
      toggleWallMarkerSelected(
        marker.getElement(),
        wallId === selectedSummary?.id,
      );
    }
  }, [selectedSummary?.id]);

  useEffect(() => {
    if (!focusWallId) {
      appliedFocusWallIdRef.current = null;
      return;
    }

    if (
      !mapReady ||
      !wallsLoaded ||
      appliedFocusWallIdRef.current === focusWallId
    ) {
      return;
    }

    const targetWall = wallsRef.current.find((wall) => wall.id === focusWallId);

    if (!targetWall) {
      return;
    }

    appliedFocusWallIdRef.current = focusWallId;
    mapRef.current?.flyTo({
      center: [targetWall.longitude, targetWall.latitude],
      zoom: Math.max(
        mapRef.current?.getZoom() ?? INITIAL_REGION_ZOOM,
        FOCUSED_WALL_ZOOM,
      ),
    });
    void fetchWallDetail(targetWall);
  }, [focusWallId, mapReady, wallsLoaded]);

  function handleFocusUserLocation() {
    if (!userLocation) {
      return;
    }

    mapRef.current?.flyTo({
      center: [userLocation.longitude, userLocation.latitude],
      zoom: LOCATION_JUMP_ZOOM,
    });
  }

  const detailImageUrl =
    selectedDetail?.thumbnailImageUrl ??
    selectedDetail?.photoUrl ??
    selectedSummary?.photoUrl ??
    null;
  const selectedCanvas = selectedDetail?.canvas ?? null;
  const selectedWallName = selectedDetail?.name ?? selectedSummary?.name ?? "";
  const selectedWallId = selectedDetail?.id ?? selectedSummary?.id ?? null;
  const selectedWallAddress =
    selectedDetail?.displayAddress ?? selectedSummary?.displayAddress ?? null;
  const activeConnectionCount = selectedCanvas?.activeConnectionCount ?? 0;

  if (!mapTilerKey) {
    return (
      <div className="relative h-full min-h-[540px] w-full overflow-hidden border border-border bg-bg-muted shadow-[var(--shadow-elevated)] max-[720px]:min-h-[460px]">
        <div className="empty-state">
          <div>
            <strong>NEXT_PUBLIC_MAPTILER_KEY</strong>{" "}
            を設定すると壁マップを表示できます。
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[540px] w-full overflow-hidden border border-border bg-bg-muted shadow-[var(--shadow-elevated)] max-[720px]:min-h-[460px]">
      {initialView ? (
        <div className="absolute inset-0 h-full w-full" ref={containerRef} />
      ) : null}

      {!mapReady && !mapError ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-overlay/25 p-6 backdrop-blur-[2px]">
          <div className="rounded-[22px] border border-border bg-bg-elevated px-6 py-5 text-fg shadow-[var(--shadow-panel)]">
            <Spinner label="地図を準備中..." size="lg" />
          </div>
        </div>
      ) : null}

      {mapReady ? (
        <div className="absolute right-[58px] top-3.5 z-30 flex gap-2 max-[720px]:right-[54px] max-[720px]:top-2.5">
          <button
            aria-label="現在地へ移動"
            className="grid h-[42px] w-[42px] place-items-center rounded-full border border-border bg-bg-elevated text-location shadow-[var(--shadow-button)] transition hover:-translate-y-px hover:border-border-strong hover:bg-bg hover:text-location-hover focus-visible:-translate-y-px focus-visible:border-border-strong focus-visible:bg-bg focus-visible:text-location-hover disabled:cursor-not-allowed disabled:opacity-55"
            disabled={!userLocation}
            onClick={handleFocusUserLocation}
            title="現在地へ移動"
            type="button"
          >
            <CurrentLocationIcon />
          </button>
        </div>
      ) : null}

      {mapError ? (
        <div
          className="absolute left-3.5 top-3.5 z-30 max-w-[min(360px,calc(100%-28px))] rounded-2xl border border-danger/20 bg-danger-bg/94 px-3.5 py-3 text-danger shadow-[var(--shadow-button)] max-[720px]:left-2.5 max-[720px]:top-2.5 max-[720px]:max-w-[calc(100%-20px)]"
          role="alert"
        >
          {mapError}
        </div>
      ) : null}

      {wallFetchError ? (
        <div
          className="absolute left-3.5 top-[66px] z-30 max-w-[min(360px,calc(100%-28px))] rounded-2xl border border-danger/20 bg-danger-bg/94 px-3.5 py-3 text-danger shadow-[var(--shadow-button)] max-[720px]:left-2.5 max-[720px]:top-[60px] max-[720px]:max-w-[calc(100%-20px)]"
          role="alert"
        >
          {wallFetchError}
        </div>
      ) : null}

      <section
        aria-live="polite"
        className={`absolute inset-x-0 bottom-0 z-40 transition-transform duration-200 ${selectedSummary ? "pointer-events-auto translate-y-0" : "pointer-events-none translate-y-[calc(100%+32px)]"}`}
      >
        {selectedSummary ? (
          <div className="relative rounded-t-[22px] border border-border bg-bg-elevated p-4 shadow-[var(--shadow-panel)] backdrop-blur-[14px]">
            <div className="mb-3 flex justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-2xl font-bold">
                  {selectedWallName}
                </h2>
                <p className="m-0 truncate text-sm leading-6 text-fg-muted">
                  {selectedWallAddress ?? "住所未登録"}
                </p>
              </div>
              <button
                aria-label="詳細を閉じる"
                className="grid h-[34px] w-[34px] place-items-center rounded-full border border-border bg-bg-elevated transition hover:-translate-y-px hover:border-border-strong hover:bg-bg focus-visible:-translate-y-px focus-visible:border-border-strong focus-visible:bg-bg"
                onClick={() => {
                  setSelectedSummary(null);
                  setSelectedDetail(null);
                  setDetailStatus("idle");
                }}
                type="button"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="grid gap-4 grid-cols-2">
              <div className="aspect-square max-w-52 overflow-hidden rounded-lg bg-bg-muted">
                {detailImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={selectedWallName}
                    className="h-full w-full object-cover"
                    src={detailImageUrl}
                  />
                ) : (
                  <div className="grid h-full place-items-center bg-bg-muted text-sm text-fg-muted">
                    No Image
                  </div>
                )}
              </div>
              <div className="flex flex-col justify-between">
                <div className="grid text-fg-muted">
                  <div className="flex items-center gap-2 py-2">
                    <FrameCornersIcon size={20} />
                    <p className="m-0">
                      {selectedCanvas
                        ? `${selectedCanvas.width} x ${selectedCanvas.height}px`
                        : detailStatus === "loading"
                          ? "Canvas 読込中"
                          : "Canvas 未設定"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 py-2">
                    <UsersIcon size={20} />
                    <p className="m-0">{activeConnectionCount} 人が接続中</p>
                  </div>
                </div>
                {detailStatus === "error" ? (
                  <div className="text-sm text-danger">
                    詳細を取得できませんでした。
                  </div>
                ) : null}
                <div className="space-y-2">
                  {selectedCanvas ? (
                    <Link
                      className="button button-primary w-full justify-between"
                      href={`/canvases/${selectedCanvas.id}`}
                    >
                      <span className="flex items-center gap-2">
                        <PaintBrushBroadIcon size={24} />
                        <span>ペイント</span>
                      </span>

                      <CaretRightIcon size={20} />
                    </Link>
                  ) : (
                    <button
                      className="button button-primary w-full justify-between"
                      disabled
                      type="button"
                    >
                      <span className="flex items-center gap-2">
                        <PaintBrushBroadIcon size={24} />
                        <span>ペイント</span>
                      </span>
                      <CaretRightIcon size={20} />
                    </button>
                  )}
                  {selectedDetail?.rectifiedImageUrl && selectedWallId ? (
                    <Link
                      className="button button-secondary w-full justify-between"
                      href={`/ar/${selectedWallId}`}
                    >
                      <span className="flex items-center gap-2">
                        <CubeFocusIcon size={24} />
                        <span>AR</span>
                      </span>

                      <CaretRightIcon size={20} />
                    </Link>
                  ) : (
                    <button
                      className="button button-secondary w-full justify-between"
                      disabled
                      type="button"
                    >
                      <span className="flex items-center gap-2">
                        <CubeFocusIcon size={24} />
                        <span>AR</span>
                      </span>

                      <CaretRightIcon size={20} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
