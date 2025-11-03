import { Subject } from "rxjs";

/**
 * ### 视频帧解码器
 * - 该解码器依赖固定的文件头
 */
export class WalleVideoDecoder implements WalleSpec.Decoder {
  constructor(options: WalleSpec.VideoDecoderOptions) {
    const decoder = new VideoDecoder({
      output: (frame) => {
        const meta = this.#frameMetaMap.get(frame.timestamp);
        if (!meta) return;
        this.#frame$.next({ ...meta, frame });
        this.#frameMetaMap.delete(frame.timestamp);
      },
      error: (error) => {
        this.#error$.next(
          new Error(error.message, {
            cause: error.cause,
          })
        );
      },
    });
    this.#decoder = decoder;

    const { duration } = options;
    this.#options = {
      duration: Math.floor(duration),
    };
  }

  #options: Required<WalleSpec.VideoDecoderOptions>;
  #decoder: VideoDecoder;
  #frameMetaMap = new Map<number, WalleSpec.VideoMeta>();

  #isConfigured = false;
  get isConfigured() {
    return this.#isConfigured;
  }

  #frame$ = new Subject<WalleSpec.Video>();
  get frame$() {
    return this.#frame$.pipe();
  }

  #error$ = new Subject<Error>();
  get error$() {
    return this.#error$.pipe();
  }

  /** 从帧头中解析元信息 */
  #getMeta = async (view: DataView, buffer: Blob) => {
    const arrayBuffer = await buffer.arrayBuffer();
    const data_length = view.getUint32(8, false);
    const data = new DataView(arrayBuffer.slice(8, 8 + data_length));
    const meta: WalleSpec.VideoMeta = {
      /** walle 设备版本号*/
      version: view.getUint32(0, false),
      /** 服务类型 */
      type: view.getUint32(4, false),
      /** 图像帧序 */
      index: Number(data.getBigUint64(0, false)),
      /** 图像字节大小 */
      data_len: data.getInt32(12, false),
      /** 图像宽度 */
      img_w: data.getInt32(20, false),
      /** 图像高度 */
      img_h: data.getInt32(24, false),
      /** 当前帧中是否存在人脸 */
      has_face: Boolean(data.getInt32(28, false)),
      /** 图像中人脸数量 */
      face_num: view.getInt32(28, false),
      /** 人脸框的颜色 */
      is_wakepup: data.getInt32(32, false),
      /** 人脸 index */
      face_index: Number(view.getBigInt64(32, false)),
      /** 人脸宽度 (px) */
      face_w: data.getInt32(36, false),
      /** 人脸高度 (px) */
      face_h: data.getInt32(40, false),
      /** 人脸起始 x 坐标 */
      face_x: data.getInt32(44, false),
      /** 人脸起始 y 坐标 */
      face_y: data.getInt32(48, false),
      /** 嘴唇宽度 (px) */
      mouth_w: data.getInt32(52, false),
      /** 嘴唇高度 (px) */
      mouth_h: data.getInt32(56, false),
      /** 嘴唇起始 x 坐标 */
      mouth_x: data.getInt32(60, false),
      /** 嘴唇起始 y 坐标 */
      mouth_y: data.getInt32(64, false),
    };
    return {
      /** 元信息 */
      meta,
      /** 元信息字节长度 */
      length: 72,
    };
  };

  /**
   * ### 是否为关键帧
   * - 检查 H.264/AVC 视频流中的 NAL 单元
   * - 关键的常量来自 H.264 视频编码标准 (ITU-T H.264, ISO/IEC 14496-10)
   * - `0x00 0x00 0x01` 或 `0x00 0x00 0x00 0x01` 是 H.264 码流中的起始码 (start code), 这个序列用于标记每个 NAL 单元的开始
   * - NAL header 的最后 5 位表示 NAL 单元类型
   * - `& 0x1F` 操作提取这最后 5 位
   * - `nalUnitType = 5` 表示 IDR (Instantaneous Decoding Refresh) 帧
   * - IDR 帧是一种特殊的 I 帧(关键帧)，解码器会清空之前的参考帧缓存
   * @todo 可优化
   */
  #isKeyFrame = (frameView: DataView): boolean => {
    const length = frameView.byteLength;
    for (let i = 0; i < length - 4; i++) {
      if (frameView.getUint8(i) !== 0x00) continue;
      if (frameView.getUint8(i + 1) !== 0x00) continue;
      const thirdByte = frameView.getUint8(i + 2);
      if (
        thirdByte !== 0x01 &&
        !(thirdByte === 0x00 && frameView.getUint8(i + 3) === 0x01)
      )
        continue;
      const offset = thirdByte === 0x01 ? i + 3 : i + 4;
      const nalHeader = frameView.getUint8(offset);
      const nalUnitType = nalHeader & 0x1f;
      if (nalUnitType === 5) return true;
    }
    return false;
  };

  config = async (decoderConfig: VideoDecoderConfig) => {
    const { config, supported } =
      await VideoDecoder.isConfigSupported(decoderConfig);
    if (!supported || !config) return;
    this.#decoder.configure(config);
    this.#isConfigured = true;
  };

  decode = async (frame: Blob | ArrayBuffer) => {
    try {
      const buffer =
        frame instanceof ArrayBuffer ? frame : await frame.arrayBuffer();
      const view = new DataView(buffer);

      // 前 metaLength 个字节为帧的元信息
      const blob = frame instanceof Blob ? frame : new Blob([buffer]);
      const { meta, length: metaLength } = await this.#getMeta(view, blob);
      // 自增长时间戳
      this.#frameMetaMap.set(meta.index, meta);

      // 截取实际负载
      const video_data = view.buffer.slice(
        metaLength,
        metaLength + meta.data_len
      );

      // 判断是否为关键帧
      const videoView = new DataView(video_data);
      const isKeyFrame = this.#isKeyFrame(videoView);
      const chunk = new EncodedVideoChunk({
        type: isKeyFrame ? "key" : "delta",
        duration: this.#options.duration,
        timestamp: meta.index,
        data: video_data,
        // transfer: [video_data]
      });
      this.#decoder.decode(chunk);
    } catch (err) {
      this.#error$.next(err instanceof Error ? err : new Error(`${err}`));
    }
  };
}
