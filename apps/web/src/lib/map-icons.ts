const ARROW_SIZE = 32;
const STOP_SIZE = 20;

function canvasContext(size: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} | null {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  ctx.clearRect(0, 0, size, size);
  return { canvas, ctx };
}

function toImageData(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new ImageData(canvas.width, canvas.height);
  }
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** Chevron pointing right so MapLibre line placement aims along travel. */
export function createRouteArrowImage(): ImageData | null {
  const drawn = canvasContext(ARROW_SIZE);
  if (!drawn) {
    return null;
  }
  const { canvas, ctx } = drawn;
  ctx.fillStyle = '#141820';
  ctx.beginPath();
  ctx.moveTo(6, 7);
  ctx.lineTo(26, 16);
  ctx.lineTo(6, 25);
  ctx.lineTo(11, 16);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  return toImageData(canvas);
}

/** Small circle for bus stops. */
export function createStopIconImage(): ImageData | null {
  const drawn = canvasContext(STOP_SIZE);
  if (!drawn) {
    return null;
  }
  const { canvas, ctx } = drawn;
  const cx = STOP_SIZE / 2;
  const cy = STOP_SIZE / 2;
  const r = 6;

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#185fa5';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.fillStyle = '#185fa5';
  ctx.beginPath();
  ctx.arc(cx, cy, 2, 0, Math.PI * 2);
  ctx.fill();

  return toImageData(canvas);
}
