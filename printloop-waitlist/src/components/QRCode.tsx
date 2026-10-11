import { useEffect, useRef, useState, useCallback } from 'react';

interface QRCodeProps {
  data?: string;
  size?: number;
  className?: string;
  animate?: boolean;
  interactive?: boolean;
  caption?: string;
}

const DEMO_QR_DATA = 'https://printloop.ng/print/uniabuja/demo-job-001';
const MODULE_COUNT = 29; // Version 3 QR = 29x29 modules

function generateQRModules(data: string): boolean[][] {
  const modules: boolean[][] = [];
  const moduleCount = MODULE_COUNT;
  
  for (let y = 0; y < moduleCount; y++) {
    modules[y] = [];
    for (let x = 0; x < moduleCount; x++) {
      // Deterministic pseudo-random based on data + position
      const hash = simpleHash(data + x + ',' + y);
      modules[y][x] = hash % 2 === 0;
    }
  }
  
  // Force finder patterns (corners)
  drawFinderPattern(modules, 0, 0);
  drawFinderPattern(modules, moduleCount - 7, 0);
  drawFinderPattern(modules, 0, moduleCount - 7);
  
  // Force timing patterns
  for (let i = 8; i < moduleCount - 8; i++) {
    modules[6][i] = i % 2 === 0;
    modules[i][6] = i % 2 === 0;
  }
  
  return modules;
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function drawFinderPattern(modules: boolean[][], startX: number, startY: number) {
  const pattern = [
    [1,1,1,1,1,1,1],
    [1,0,0,0,0,0,1],
    [1,0,1,1,1,0,1],
    [1,0,1,1,1,0,1],
    [1,0,1,1,1,0,1],
    [1,0,0,0,0,0,1],
    [1,1,1,1,1,1,1],
  ];
  
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      modules[startY + y][startX + x] = pattern[y][x] === 1;
    }
  }
}

export function QRCode({ 
  data = DEMO_QR_DATA, 
  size = 280, 
  className = '', 
  animate = false, 
  interactive = false,
  caption 
}: QRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const displaySize = size;
    const actualSize = displaySize * dpr;

    canvas.width = actualSize;
    canvas.height = actualSize;
    canvas.style.width = `${displaySize}px`;
    canvas.style.height = `${displaySize}px`;

    ctx.scale(dpr, dpr);

    const modules = generateQRModules(data);
    const moduleCount = modules.length;
    const moduleSize = displaySize / moduleCount;

    // Clear
    ctx.fillStyle = '#F8F4ED'; // paper
    ctx.fillRect(0, 0, displaySize, displaySize);

    // Draw modules
    ctx.fillStyle = '#1A1410'; // ink
    
    for (let y = 0; y < moduleCount; y++) {
      for (let x = 0; x < moduleCount; x++) {
        if (modules[y][x]) {
          const px = x * moduleSize;
          const py = y * moduleSize;
          // Crisp pixel rendering
          ctx.fillRect(Math.floor(px), Math.floor(py), Math.ceil(moduleSize), Math.ceil(moduleSize));
        }
      }
    }

    // Quiet zone (4 modules)
    const quietZone = moduleSize * 4;
    ctx.fillStyle = '#F8F4ED';
    ctx.fillRect(0, 0, displaySize, quietZone);
    ctx.fillRect(0, 0, quietZone, displaySize);
    ctx.fillRect(0, displaySize - quietZone, displaySize, quietZone);
    ctx.fillRect(displaySize - quietZone, 0, quietZone, displaySize);

    // Border
    ctx.strokeStyle = '#1A1410';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, displaySize - 3, displaySize - 3);

    if (animate) {
      canvas.style.opacity = '0';
      canvas.style.filter = 'blur(8px) contrast(0.3)';
      canvas.style.transform = 'scale(0.95)';
      canvas.style.transition = 'opacity 1.2s cubic-bezier(0.16, 1, 0.3, 1), filter 1.2s cubic-bezier(0.16, 1, 0.3, 1), transform 1.2s cubic-bezier(0.16, 1, 0.3, 1)';
      
      requestAnimationFrame(() => {
        canvas.style.opacity = '1';
        canvas.style.filter = 'none';
        canvas.style.transform = 'scale(1)';
      });
    }
  }, [data, size, animate]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive || !wrapperRef.current) return;
    
    const rect = wrapperRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    setMousePos({ x, y });
  }, [interactive]);

  const handleMouseLeaveWrapper = useCallback(() => {
    setMousePos(null);
  }, []);

  return (
    <div
      ref={wrapperRef}
      className={`qr-wrapper ${className}`}
      style={{
        '--mouse-x': mousePos ? `${mousePos.x}%` : '50%',
        '--mouse-y': mousePos ? `${mousePos.y}%` : '50%',
      } as React.CSSProperties}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeaveWrapper}
    >
      <canvas
        ref={canvasRef}
        className={`qr-canvas ${animate ? 'qr-canvas--animate' : ''} ${interactive ? 'qr-canvas--interactive' : ''}`}
        aria-label="PrintLoop QR code — scan to print"
        role="img"
      />
      <div className="qr-glow" aria-hidden="true" />
      {caption && (
        <p className="qr-caption" style={{ 
          marginTop: '1rem', 
          fontSize: '0.6875rem', 
          color: 'var(--fog)',
          textAlign: 'center',
          fontFamily: "'Fraunces', Georgia, serif",
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.1em'
        }}>
          {caption}
        </p>
      )}
    </div>
  );
}

export function QRCodeCard({ data = DEMO_QR_DATA, className = '', caption }: { data?: string; className?: string; caption?: string }) {
  return (
    <QRCode 
      data={data} 
      size={96} 
      className={`${className} qr-canvas--card`}
      caption={caption}
    />
  );
}