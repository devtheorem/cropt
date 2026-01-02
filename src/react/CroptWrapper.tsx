import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import Cropt from '../cropt.ts';

// Define prop types
interface CroptWrapperProps {
  src: string; // Image URL
  options?: Partial<{
    mouseWheelZoom: 'off' | 'on' | 'ctrl';
    viewport: {
      width: number;
      height: number;
      borderRadius: string;
    };
    zoomerInputClass: string;
    enableZoomSlider: boolean;
    enableKeypress: boolean;
    resizeBars: boolean;
    enableRotateBtns: boolean;
    transparencyColor: string;
  }>;
  onCropChange?: (cropData: {
    crop: { x: number; y: number; width: number; height: number };
    transform: {
      x: number;
      y: number;
      scale: number;
      rotate: number;
      origin: { x: number; y: number };
    };
    viewport: {
      width: number;
      height: number;
      borderRadius: string;
    };
  }) => void;
  onReady?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

const CroptWrapper: React.FC<CroptWrapperProps> = ({
  src,
  options = {},
  onCropChange,
  onReady,
  className = '',
  style = {},
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const croptInstanceRef = useRef<Cropt | null>(null);

  // Debounced crop update callback
  const handleCropChange = useCallback(() => {
    if (!croptInstanceRef.current) return;
    const cropData = croptInstanceRef.current.get();
    onCropChange?.(cropData);
  }, [onCropChange]);

  // Initialize Cropt instance
  useEffect(() => {
    if (!containerRef.current) return;

    // Create new Cropt instance
    const instance = new Cropt(containerRef.current, {
      ...options,
      // Always enable these for React integration
      enableKeypress: true,
      enableZoomSlider: true,
      resizeBars: true,
      enableRotateBtns: true,
    });

    croptInstanceRef.current = instance;

    // Bind image
    instance.bind(src).then(() => {
      onReady?.();
      // Trigger initial crop update
      handleCropChange();
    });

    // Set up event listener for crop changes
    const debouncedUpdate = () => setTimeout(handleCropChange, 50);
    instance.elements.viewport.addEventListener('pointermove', debouncedUpdate);
    instance.elements.zoomer.addEventListener('input', debouncedUpdate);
    instance.elements.rotateLeft.addEventListener('click', debouncedUpdate);
    instance.elements.rotateRight.addEventListener('click', debouncedUpdate);

    // Cleanup
    return () => {
      instance.destroy();
      croptInstanceRef.current = null;
    };
  }, [src, options, onReady, handleCropChange]);

  // Re-bind image if src changes
  useEffect(() => {
    if (!croptInstanceRef.current) return;
    croptInstanceRef.current.bind(src).then(() => {
      handleCropChange();
    });
  }, [src, handleCropChange]);

  // Update options if they change
  useEffect(() => {
    if (!croptInstanceRef.current) return;
    croptInstanceRef.current.setOptions(options);
  }, [options]);

  // Expose methods to parent via ref (optional)
  const publicMethods = useMemo(() => ({
    getCrop: () => croptInstanceRef.current?.get(),
    setZoom: (value: number) => croptInstanceRef.current?.setZoom(value),
    setRotation: (degrees: number) => croptInstanceRef.current?.setRotation(degrees),
    refresh: () => croptInstanceRef.current?.refresh(),
  }), []);

  // Attach public methods to ref (if needed)
  const wrapperRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      (node as any).cropt = publicMethods;
    }
  }, [publicMethods]);

  return (
    <div
      ref={(node) => {
        containerRef.current = node;
        wrapperRef(node);
      }}
      className={`cropt-wrapper ${className}`}
      style={style}
    />
  );
};

export default CroptWrapper;