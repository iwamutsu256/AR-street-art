export function decodeBase64Pixels(encoded: string) {
  const binary = atob(encoded);
  const pixels = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    pixels[index] = binary.charCodeAt(index);
  }

  return pixels;
}

export function getCanvasWebSocketUrl(canvasId: string, basePath: string) {
  const trimmedBasePath = basePath.replace(/\/$/, '');

  if (/^wss?:\/\//.test(trimmedBasePath)) {
    return `${trimmedBasePath}/canvases/${canvasId}`;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${trimmedBasePath}/canvases/${canvasId}`;
}
