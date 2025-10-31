import { WalleVideoDecoder } from "../decoders/video";

// Worker 环境类型声明
interface WorkerContext {
  postMessage(message: any, transfer?: Transferable[]): void;
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
}
declare const globalThis: WorkerContext;

const decoder = new WalleVideoDecoder({
  duration: 1000 / 30,
});

decoder.frame$.subscribe((frameInfo) => {
  globalThis.postMessage(
    {
      payload: frameInfo,
      message: "success",
    } satisfies WalleSpec.WorkerOutput<WalleSpec.Video>,
    [frameInfo.frame]
  );
});

decoder.error$.subscribe((error) => {
  globalThis.postMessage({
    error: true,
    message: error.message,
  } satisfies WalleSpec.WorkerOutput<WalleSpec.Video>);
});

globalThis.addEventListener(
  "message",
  async (ev: MessageEvent<ArrayBuffer>) => {
    try {
      if (!decoder.isConfigured) {
        await decoder.config({
          codec: "avc1.64001f",
          optimizeForLatency: true,
          hardwareAcceleration: "prefer-hardware",
          codedWidth: 1920,
          codedHeight: 1080,
        });
      }
      await decoder.decode(ev.data);
    } catch (err) {
      globalThis.postMessage({
        error: true,
        message: err instanceof Error ? err.message : `${err}`,
      } satisfies WalleSpec.WorkerOutput<WalleSpec.Video>);
    }
  }
);
