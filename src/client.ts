import { FrameHelper } from "./frame-helper";
import { VideoRenderer, VideoRendererOptions } from "./renderers";
import { Enum } from "./utils/enum";
import { EventEmitter } from "./utils/event-emitter";
import { parseASRResult } from "./utils/asr-parser";
import { audioDecodeWorkerURL, videoDecodeWorkerURL } from "./workers";

const { SERVICE_TYPE_AUDIO, SERVICE_TYPE_VIDEO } = FrameHelper;

/**
 * ### 瓦力客户端
 */
export class Client extends EventEmitter<WalleSpec.ClientEventMap> {
  #CLOSE_REASONS = {
    UNPROMPTED: new Enum(1000, "UNPROMPTED", "主动关闭"),
  } as const;

  #socket: WebSocket | null = null;
  get socket() {
    return this.#socket;
  }

  #renderer: VideoRenderer | null = null;

  /** 解码策略 */
  #decoderWorkerMap = (() => {
    const audioWorker = audioDecodeWorkerURL({
      name: "音频解码线程",
    });
    audioWorker.addEventListener(
      "message",
      (ev: MessageEvent<WalleSpec.WorkerOutput<WalleSpec.Audio>>) => {
        if (ev.data.error)
          return this.subjectNext(
            "error",
            new Error(ev.data.message ?? "音频解码失败，原因未知")
          );
        this.subjectNext("audioframe", ev.data.payload as WalleSpec.Audio);
      }
    );
    const videoWorker = videoDecodeWorkerURL({
      name: "视频解码线程",
    });
    videoWorker.addEventListener(
      "message",
      (ev: MessageEvent<WalleSpec.WorkerOutput<WalleSpec.Video>>) => {
        if (ev.data.error)
          return this.subjectNext(
            "error",
            new Error(ev.data.message ?? "视频解码失败，原因未知")
          );
        this.subjectNext("videoframe", ev.data.payload as WalleSpec.Video);
      }
    );
    return new Map<Enum["value"], Worker>([
      [SERVICE_TYPE_AUDIO.value, audioWorker],
      [SERVICE_TYPE_VIDEO.value, videoWorker],
    ]);
  })();

  /** 状态改变 promise */
  #stateChangePromise: Promise<void> | null = null;

  #createErrorFromEvent = (ev: Event, socket: WebSocket): Error => {
    if (ev instanceof ErrorEvent) return new Error(ev.message);
    return new Error(
      JSON.stringify({
        type: ev.type,
        timeStamp: ev.timeStamp,
        url: socket.url,
        readState: socket.readyState,
      })
    );
  };

  #processMessage = async (ev: MessageEvent<WalleSpec.ClientMessageData>) => {
    const payload = ev.data;
    if (typeof payload === "string") {
      try {
        // 使用新的解析器来兼容不同版本的ASR数据
        const asrResult = parseASRResult(payload);
        this.subjectNext("asrResult", asrResult);
      } catch (error) {
        this.subjectNext(
          "error",
          new Error(
            `ASR数据解析失败: ${error instanceof Error ? error.message : "未知错误"}`
          )
        );
      }
      return;
    }
    const helper = new FrameHelper(payload);
    const meta = await helper.getMeta();
    const worker = this.#decoderWorkerMap.get(meta.value);
    if (!worker) return;
    const buffer = await payload.arrayBuffer();
    worker.postMessage(buffer, [buffer]);
  };

  /** 渲染到画板 */
  renderTo = (
    canvas: HTMLCanvasElement,
    options: VideoRendererOptions = {}
  ) => {
    this.#renderer = new VideoRenderer(this, canvas, options);
  };

  /** 取消画板渲染 */
  cancelRender = () => {
    if (!this.#renderer) return;
    this.#renderer.destory();
    this.#renderer = null;
  };

  /** 连接瓦力服务 */
  connect = async (url: string): Promise<void> => {
    await this.#stateChangePromise;

    if (this.#socket) await this.close();

    const controller = new AbortController();

    const socket = new WebSocket(url);
    this.subjectNext("statechange", WebSocket.CONNECTING);
    this.#socket = socket;

    const promise = new Promise<void>((resolve, reject) => {
      socket.addEventListener(
        "open",
        () => {
          // TODO 临时心跳处理
          const timer = window.setInterval(() => socket.send("PING"), 5000);
          controller.signal.addEventListener(
            "abort",
            () => {
              window.clearInterval(timer);
            },
            { once: true }
          );
          resolve();
          this.subjectNext("open", socket);
          controller.abort();
        },
        { once: true, signal: controller.signal }
      );

      // 连接建立前的错误直接抛出
      socket.addEventListener(
        "error",
        () => {
          reject(new Error(`连接地址 "${socket.url}" 失败`));
          controller.abort();
        },
        { once: true, signal: controller.signal }
      );
    }).finally(() => {
      this.#stateChangePromise = null;
    });

    socket.addEventListener("message", this.#processMessage);

    socket.addEventListener(
      "close",
      () => {
        this.subjectNext("statechange", WebSocket.CLOSED);
        this.#socket = null;
        this.subjectNext("closed", socket);
      },
      { once: true }
    );

    this.#stateChangePromise = promise;

    await promise;

    // 连接建立后的错误发送给 subject error
    socket.addEventListener("error", (ev) => {
      this.subjectNext("error", this.#createErrorFromEvent(ev, socket));
    });
  };

  /**
   * ### 断开瓦力服务
   * 主动断开不会触发重连
   */
  close = async (): Promise<void> => {
    await this.#stateChangePromise;

    const socket = this.#socket;

    if (!socket || socket.readyState === WebSocket.CLOSED) return;

    const { UNPROMPTED } = this.#CLOSE_REASONS;
    const controller = new AbortController();

    socket.close(UNPROMPTED.value, UNPROMPTED.label);
    this.subjectNext("statechange", WebSocket.CLOSING);

    const promise = new Promise<void>((resolve, reject) => {
      socket.addEventListener(
        "close",
        () => {
          this.subjectNext("statechange", WebSocket.CLOSED);
          resolve();
          controller.abort();
        },
        { once: true, signal: controller.signal }
      );

      socket.addEventListener(
        "error",
        () => {
          reject(new Error(`关闭连接 "${socket.url}" 失败`));
          controller.abort();
        },
        { once: true, signal: controller.signal }
      );
    }).finally(() => {
      this.#stateChangePromise = null;
    });

    this.#stateChangePromise = promise;

    await promise;
  };

  /**
   * 结束客户端生命周期，清理所有资源占用。
   */
  destory = async () => {
    this.cancelRender();
    await this.close();
  };

  constructor() {
    super();
  }
}
