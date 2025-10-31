import { WalleAudioDecoder } from "../decoders/audio";

// Worker 环境类型声明
interface WorkerContext {
  postMessage(message: any, transfer?: Transferable[]): void;
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
}
declare const globalThis: WorkerContext;

const decoder = new WalleAudioDecoder();

decoder.frame$.subscribe((frameInfo) => {
  globalThis.postMessage(
    {
      payload: frameInfo,
      message: "success",
    } satisfies WalleSpec.WorkerOutput<WalleSpec.Audio>,
    [frameInfo.frame]
  );
});

decoder.error$.subscribe((error) => {
  globalThis.postMessage({
    error: true,
    message: error.message,
  } satisfies WalleSpec.WorkerOutput<WalleSpec.Audio>);
});

globalThis.addEventListener(
  "message",
  async (ev: MessageEvent<ArrayBuffer>) => {
    try {
      await decoder.decode(ev.data);
    } catch (err) {
      globalThis.postMessage({
        error: true,
        message: err instanceof Error ? err.message : `${err}`,
      } satisfies WalleSpec.WorkerOutput<WalleSpec.Audio>);
    }
  }
);