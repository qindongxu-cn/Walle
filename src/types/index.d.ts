/// <reference types="rxjs" />

/**
 * 瓦力 SDK 规范
 */
declare global {
  namespace WalleSpec {
    /** 帧数据头 */
    interface Frame {
      /** 数据类型 */
      type: number;
      /** 帧数据长度 (字节数) */
      data_len: number;
    }

    /** 音频元信息 */
    interface AudioMeta extends Frame {
      /** VAD 状态值 0:None 1:Begin 2:continue 3:End */
      vad_status: number;
    }

    /** 音频帧包 (解码后) */
    interface Audio extends AudioMeta {
      /** 音频数据 */
      frame: ArrayBuffer;
    }

    /** 视频元信息 */
    interface VideoMeta extends Frame {
      /** walle设备版本号*/
      version: number;
      /** 图像帧序 */
      index: number;
      /** 图像宽度 */
      img_w: number;
      /** 图像高度 */
      img_h: number;
      /** 当前帧中是否存在人脸 */
      has_face: boolean;
      /** 图像中人脸数量 */
      face_num: number;
      /** 人脸 index */
      face_index: number;
      /** 人脸框颜色标识*/
      is_wakepup: number;
      /** 人脸宽度 (px) */
      face_w: number;
      /** 人脸高度 (px) */
      face_h: number;
      /** 人脸起始 x 坐标 */
      face_x: number;
      /** 人脸起始 y 坐标 */
      face_y: number;
      /** 嘴唇宽度 (px) */
      mouth_w: number;
      /** 嘴唇高度 (px) */
      mouth_h: number;
      /** 嘴唇起始 y 坐标 */
      mouth_x: number;
      /** 嘴唇起始 y 坐标 */
      mouth_y: number;
    }

    /** 视频帧包 (解码后) */
    interface Video extends VideoMeta {
      frame: VideoFrame;
    }

    interface VideoDecoderOptions {
      /** 每帧的持续时间 (微秒) */
      duration: number;
    }

    /** 帧数据元信息 */
    interface FrameMeta {
      /** 帧元数据的名称 */
      label: string;
      /** 帧元数据的标识 */
      key: string;
      /** 帧元数据的整数 id */
      value: number;
    }

    /** 语音识别结果 (版本1) */
    interface ASRResult {
      /** 用户的输入，可能和请求中的原始 text 不完全一致，服务器可能会对 text 进行语言纠错。 */
      text: {
        /** 开始 begin */
        bg: number;
        /** 结束 end */
        ed: number;
        /** 是否最后一句 last sentence */
        ls: boolean;
        /**
         * `progress`，含有如下值：
         * - `apd`: `append`，表示添加新内容。
         * - `rpl`: `replace`，表示更新之前的内容。
         */
        pgs: "apd" | "rpl";
        /**
         * `range`，表示句子的替换范围 `[start, end]`。
         * @note 该字段只在 `pgs` 为 `rpl` 时出现。
         */
        rg?: [start: number, end: number];
        /**
         * `result type`，含有如下值：
         * - `pgs`: `progress`，表示这是一个中间识别结果。
         * - `rlt`: `result`，表示这是更完整或最终的识别结果。
         */
        rst: "pgs" | "rlt";
        /** 第几句 sentence */
        sn: number;
        /** 词 word */
        ws: {
          /** 开始 begin */
          bg: number;
          /** 中文分词 chinese word */
          cw: {
            /** 分数 score */
            sc: number;
            /** 单字 word */
            w: string;
          }[];
        }[];
      };
      /** 模型处理后的纯文本结果 */
      filtered: string;
    }

    /** 语音识别结果版本2的数据部分 */
    interface ASRResultV2Data {
      /** 模型处理后的纯文本结果 */
      filtered: string;
      /** 会话ID */
      sid: string;
      /** 说话索引 */
      speak_index: string;
      /** 用户的输入，可能和请求中的原始 text 不完全一致，服务器可能会对 text 进行语言纠错。 */
      text: {
        /** 开始 begin */
        bg: number;
        /** 结束 end */
        ed: number;
        /** 是否最后一句 last sentence */
        ls: boolean;
        /**
         * `progress`，含有如下值：
         * - `apd`: `append`，表示添加新内容。
         * - `rpl`: `replace`，表示更新之前的内容。
         */
        pgs: "apd" | "rpl";
        /**
         * `range`，表示句子的替换范围 `[start, end]`。
         * @note 该字段只在 `pgs` 为 `rpl` 时出现。
         */
        rg?: [start: number, end: number];
        /**
         * `result type`，含有如下值：
         * - `pgs`: `progress`，表示这是一个中间识别结果。
         * - `rlt`: `result`，表示这是更完整或最终的识别结果。
         */
        rst: "pgs" | "rlt";
        /** 第几句 sentence */
        sn: number;
        /** 词 word */
        ws: {
          /** 开始 begin */
          bg: number;
          /** 中文分词 chinese word */
          cw: {
            /** 分数 score */
            sc: number;
            /** 单字 word */
            w: string;
          }[];
        }[];
      };
    }

    /** 语音识别结果 (版本2) */
    interface ASRResultV2 {
      /** 动作类型 */
      action: "asr";
      /** JSON字符串格式的数据 */
      data: string;
    }

    /** 兼容的语音识别结果类型 */
    type ASRResultCompatible = ASRResult | ASRResultV2;

    /** 帧数据工具类 */
    interface FrameHelper {
      /** 获取当前帧的元数据 */
      getMeta: () => Promise<FrameMeta>;
    }

    /** 解码器规范 */
    interface Decoder {
      decode: (blob: Blob) => Promise<void>;
    }

    /** worker 输入规范 */
    interface WorkerInput<T = unknown> {
      /** 消息 id */
      id: string;
      /** 输入数据 */
      payload: T;
    }

    /** worker 输出规范 */
    interface WorkerOutput<T = unknown> {
      /** 是否发生错误 */
      error?: boolean;
      /** 输出数据 */
      payload?: T;
      /** 事件描述 */
      message?: string;
    }

    /** 运行时枚举 */
    interface Enum {
      value: number;
      label: string;
      description: string;
    }

    /** 客户端事件 */
    interface ClientEventMap {
      /** 客户端建立连接 */
      open: WebSocket;
      /** 客户端断开连接 */
      closed: WebSocket;
      /** 客户端连接状态改变 */
      statechange:
        | typeof WebSocket.CLOSED
        | typeof WebSocket.CLOSING
        | typeof WebSocket.CONNECTING
        | typeof WebSocket.OPEN;
      /** 客户端发生错误 */
      error: Error;
      /** 收到视频帧 */
      videoframe: Video;
      /** 收到音频帧 */
      audioframe: Audio;
      /** 收到语音识别结果 */
      asrResult: ASRResult;
    }

    /**
     * 作为客户端时的配置
     * @todo 设计中
     */
    interface ClientOptions {
      /** 自动重连配置 */
      reconnect?: {
        /**
         * 连接断开到下一次重连的等待时间 (ms)
         * @default 1000
         */
        delay?: number;
      };
      /**
       * 心跳配置
       * @todo 暂未实现
       */
      heartbeat?: unknown;
      /** 调试配置 */
      debug?: {
        /** 是否显示人脸标识框 @default false */
        face?: boolean;
        /** 是否显示嘴唇标识框 @default false */
        mouth?: boolean;
      };
    }

    /** 客户端可以收到的 socket 数据类型 */
    type ClientMessageData =
      | string // ASR JSON
      | Blob; // 视频、音频帧
  }
}

export {};
