import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface SceneCanvasProps {
  src: string;
  srcSet?: string;
  sizes?: string;
  alt: string;
  sourceWidth: number;
  sourceHeight: number;
  maxTopCropRatio?: number;
  fetchPriority?: 'high' | 'low' | 'auto';
  className?: string;
  imageClassName?: string;
  onSceneReady?: () => void;
  children?: ReactNode;
}

interface CanvasSize {
  width: number;
  height: number;
}

export function SceneCanvas({
  src,
  srcSet,
  sizes,
  alt,
  sourceWidth,
  sourceHeight,
  maxTopCropRatio = 0,
  fetchPriority = 'auto',
  className,
  imageClassName,
  onSceneReady,
  children,
}: SceneCanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState<CanvasSize | null>(null);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const fitScene = () => {
      const { width, height } = stage.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;

      const aspect = sourceWidth / sourceHeight;
      const safeCropRatio = Math.min(Math.max(maxTopCropRatio, 0), 0.45);
      const visibleRatio = 1 - safeCropRatio;
      const fittedWidth = Math.min(width, (height * aspect) / visibleRatio);
      setCanvasSize({
        width: fittedWidth,
        height: fittedWidth / aspect,
      });
    };

    fitScene();
    const observer = new ResizeObserver(fitScene);
    observer.observe(stage);

    return () => observer.disconnect();
  }, [maxTopCropRatio, sourceHeight, sourceWidth]);

  return (
    <div ref={stageRef} className={cn('scene-stage', className)}>
      <img
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        alt=""
        aria-hidden="true"
        className="scene-stage__ambient"
        width={sourceWidth}
        height={sourceHeight}
        fetchPriority={fetchPriority}
        decoding={fetchPriority === 'high' ? 'sync' : 'async'}
        draggable={false}
      />
      <div
        className={cn('scene-canvas', maxTopCropRatio > 0 && 'scene-canvas--crop-top')}
        style={canvasSize ?? { width: '100%', aspectRatio: `${sourceWidth} / ${sourceHeight}` }}
      >
        <img
          src={src}
          srcSet={srcSet}
          sizes={sizes}
          alt={alt}
          className={cn('absolute inset-0 h-full w-full object-contain', imageClassName)}
          width={sourceWidth}
          height={sourceHeight}
          fetchPriority={fetchPriority}
          decoding={fetchPriority === 'high' ? 'sync' : 'async'}
          draggable={false}
          onLoad={onSceneReady}
          onError={onSceneReady}
        />
        {children}
      </div>
    </div>
  );
}
