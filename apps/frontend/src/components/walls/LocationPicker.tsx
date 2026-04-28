"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { formatCoordinate } from "../../lib/walls";

export type LocationValue = {
  latitude: number;
  longitude: number;
};

type LocationPickerProps = {
  mapTilerKey: string;
  value: LocationValue | null;
  onChange: (value: LocationValue) => void;
};

type LocationPreviewMapProps = {
  mapTilerKey: string;
  value: LocationValue | null;
};

function MapCenterPin() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-full justify-items-center"
    >
      <div className="h-[22px] w-[22px] rotate-[-45deg] rounded-[50%_50%_50%_0] border-[3px] border-white/95 bg-primary shadow-[0_8px_18px_rgba(31,26,20,0.18)]" />
      <div className="-mt-0.5 h-[18px] w-[3px] rounded-full bg-[rgba(31,26,20,0.5)]" />
      <div className="mt-1 h-2 w-[26px] rounded-full bg-[rgba(31,26,20,0.16)] blur-[1px]" />
    </div>
  );
}

const DEFAULT_CENTER: LocationValue = {
  latitude: 35.691519,
  longitude: 139.696956,
};

const LOCATION_JUMP_ZOOM = 8;
const INITIAL_REGION_ZOOM = 7;
const LOCATION_PREVIEW_ZOOM = 15;

type MapTilerGeolocationResponse = {
  latitude: number;
  longitude: number;
};

export function LocationPreviewMap({
  mapTilerKey,
  value,
}: LocationPreviewMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || !mapTilerKey || !value) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${mapTilerKey}`,
      center: [value.longitude, value.latitude],
      zoom: LOCATION_PREVIEW_ZOOM,
      interactive: false,
    });

    map.on("load", () => {
      setMapError(null);
      map.resize();
    });
    map.on("error", () => {
      setMapError(
        "地図タイルを読み込めませんでした。MapTiler キーやネットワーク設定を確認してください。",
      );
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [mapTilerKey, Boolean(value)]);

  useEffect(() => {
    if (!mapRef.current || !value) {
      return;
    }

    const currentCenter = mapRef.current.getCenter();
    const centerChanged =
      Math.abs(currentCenter.lng - value.longitude) > 0.000001 ||
      Math.abs(currentCenter.lat - value.latitude) > 0.000001;
    const zoomChanged =
      Math.abs(mapRef.current.getZoom() - LOCATION_PREVIEW_ZOOM) > 0.000001;

    if (!centerChanged && !zoomChanged) {
      return;
    }

    mapRef.current.easeTo({
      center: [value.longitude, value.latitude],
      duration: 0,
      zoom: LOCATION_PREVIEW_ZOOM,
    });
  }, [value]);

  if (!mapTilerKey) {
    return (
      <div className="empty-state">
        <div>
          <strong>NEXT_PUBLIC_MAPTILER_KEY</strong>{" "}
          を設定すると地図プレビューを表示できます。
        </div>
      </div>
    );
  }

  if (!value) {
    return (
      <div className="empty-state">
        位置情報を設定すると地図を表示できます。
      </div>
    );
  }

  return (
    <>
      {mapError ? <div className="error-banner">{mapError}</div> : null}
      <div className="relative overflow-hidden rounded-lg">
        <div
          className="h-[360px] w-full max-[720px]:h-[300px]"
          ref={containerRef}
        />
        <MapCenterPin />
      </div>
    </>
  );
}

export function LocationPicker({
  mapTilerKey,
  value,
  onChange,
}: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const emitChange = useEffectEvent(onChange);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const emitCenterLocation = useEffectEvent(() => {
    if (!mapRef.current) {
      return;
    }

    const center = mapRef.current.getCenter();
    emitChange({
      latitude: Number(formatCoordinate(center.lat)),
      longitude: Number(formatCoordinate(center.lng)),
    });
  });

  useEffect(() => {
    if (!containerRef.current || !mapTilerKey) {
      return;
    }

    const initialCenter = value ?? DEFAULT_CENTER;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${mapTilerKey}`,
      center: [initialCenter.longitude, initialCenter.latitude],
      zoom: value ? LOCATION_JUMP_ZOOM : INITIAL_REGION_ZOOM,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.on("load", () => {
      setMapError(null);
      map.resize();
      emitCenterLocation();
    });
    map.on("moveend", () => {
      emitCenterLocation();
    });
    map.on("error", () => {
      setMapError(
        "地図タイルを読み込めませんでした。MapTiler キーやネットワーク設定を確認してください。",
      );
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [mapTilerKey]);

  useEffect(() => {
    if (!mapRef.current || !value) {
      return;
    }

    const currentCenter = mapRef.current.getCenter();
    const centerChanged =
      Math.abs(currentCenter.lng - value.longitude) > 0.000001 ||
      Math.abs(currentCenter.lat - value.latitude) > 0.000001;

    if (!centerChanged) {
      return;
    }

    mapRef.current.easeTo({
      center: [value.longitude, value.latitude],
      duration: 300,
      zoom: Math.max(mapRef.current.getZoom(), LOCATION_JUMP_ZOOM),
    });
  }, [value]);

  async function getApproximateIpLocation() {
    const response = await fetch(
      `https://api.maptiler.com/geolocation/ip.json?key=${mapTilerKey}`,
    );

    if (!response.ok) {
      throw new Error("IP 位置情報を取得できませんでした。");
    }

    return (await response.json()) as MapTilerGeolocationResponse;
  }

  function jumpToLocation(nextLocation: LocationValue) {
    emitChange(nextLocation);
    mapRef.current?.flyTo({
      center: [nextLocation.longitude, nextLocation.latitude],
      zoom: LOCATION_JUMP_ZOOM,
    });
  }

  async function handleLocateMe() {
    setGeoError(null);
    setLocationNotice(null);
    setIsLocating(true);

    if (!navigator.geolocation) {
      try {
        const approximateLocation = await getApproximateIpLocation();
        jumpToLocation({
          latitude: Number(formatCoordinate(approximateLocation.latitude)),
          longitude: Number(formatCoordinate(approximateLocation.longitude)),
        });
        setLocationNotice(
          "ブラウザの現在地が使えないため、IP アドレスからの概算位置へ移動しました。",
        );
      } catch {
        setGeoError("現在地も IP ベースの概算位置も取得できませんでした。");
      } finally {
        setIsLocating(false);
      }
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          latitude: Number(formatCoordinate(position.coords.latitude)),
          longitude: Number(formatCoordinate(position.coords.longitude)),
        };

        jumpToLocation(nextLocation);
        setIsLocating(false);
      },
      async () => {
        try {
          const approximateLocation = await getApproximateIpLocation();
          jumpToLocation({
            latitude: Number(formatCoordinate(approximateLocation.latitude)),
            longitude: Number(formatCoordinate(approximateLocation.longitude)),
          });
          setLocationNotice(
            "現在地を取得できなかったため、IP アドレスからの概算位置へ移動しました。",
          );
        } catch {
          setGeoError("現在地も IP ベースの概算位置も取得できませんでした。");
        } finally {
          setIsLocating(false);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10_000,
      },
    );
  }

  if (!mapTilerKey) {
    return (
      <div className="empty-state">
        <div>
          <strong>NEXT_PUBLIC_MAPTILER_KEY</strong>{" "}
          を設定すると地図から位置を選べます。
          <br />
          今は緯度・経度の入力欄から登録できます。
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-3">
        <button
          className="button button-secondary"
          disabled={isLocating}
          type="button"
          onClick={handleLocateMe}
        >
          {isLocating ? "現在地を取得中…" : "現在地へ移動"}
        </button>
      </div>
      {geoError ? <div className="error-banner">{geoError}</div> : null}
      {locationNotice ? <div className="notice">{locationNotice}</div> : null}
      {mapError ? <div className="error-banner">{mapError}</div> : null}
      <div className="relative overflow-hidden rounded-lg">
        <div className="h-90 w-full max-[720px]:h-75" ref={containerRef} />
        <MapCenterPin />
      </div>
    </div>
  );
}
