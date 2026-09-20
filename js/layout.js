export const LOGICAL_STAGE_WIDTH = 640;
export const LOGICAL_STAGE_HEIGHT = 480;
export const STAGE_MARGIN = 24;
export const MAX_STAGE_SCALE = 2;

export function calculateStageScale(viewportWidth, viewportHeight) {
  const availableWidth = Math.max(1, Number(viewportWidth) - STAGE_MARGIN);
  const availableHeight = Math.max(1, Number(viewportHeight) - STAGE_MARGIN);
  const fitScale = Math.min(
    availableWidth / LOGICAL_STAGE_WIDTH,
    availableHeight / LOGICAL_STAGE_HEIGHT
  );

  return Math.min(MAX_STAGE_SCALE, fitScale);
}
