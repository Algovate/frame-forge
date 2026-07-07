declare module 'gif.js' {
  export interface GIFOptions {
    workers?: number;
    quality?: number;
    width?: number;
    height?: number;
    workerScript?: string;
    repeat?: number | null;
    background?: string;
    transparent?: string | null;
    dither?: string | boolean;
  }

  export interface AddFrameOptions {
    delay?: number;
    copy?: boolean;
    dispose?: number;
    transparent?: string | null;
  }

  interface GIFEvents {
    progress: (progress: number) => void;
    finished: (blob: Blob) => void;
    abort: () => void;
  }

  export default class GIF {
    constructor(options?: GIFOptions);
    on<K extends keyof GIFEvents>(event: K, cb: GIFEvents[K]): void;
    on(event: string, cb: (...args: unknown[]) => void): void;
    emit(event: string, ...args: unknown[]): void;
    addFrame(
      image: HTMLImageElement | HTMLCanvasElement | ImageData | CanvasRenderingContext2D,
      options?: AddFrameOptions
    ): void;
    render(): void;
    abort(): void;
  }
}
