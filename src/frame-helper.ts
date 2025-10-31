import { Enum } from "./utils/enum";

export class FrameHelper implements WalleSpec.FrameHelper {
  static readonly SERVICE_TYPE_UNKNOWN = new Enum(
    -1,
    "SERVICE_TYPE_UNKNOWN",
    "未知数据"
  );
  static readonly SERVICE_TYPE_AUDIO = new Enum(
    1,
    "SERVICE_TYPE_AUDIO",
    "音频流"
  );
  static readonly SERVICE_TYPE_VIDEO = new Enum(
    2,
    "SERVICE_TYPE_VIDEO",
    "视频流"
  );

  /** 支持的类型 */
  static readonly #TYPES = [
    FrameHelper.SERVICE_TYPE_UNKNOWN,
    FrameHelper.SERVICE_TYPE_AUDIO,
    FrameHelper.SERVICE_TYPE_VIDEO,
  ].reduce((map, enumInstance) => {
    return map.set(enumInstance.value, {
      value: enumInstance.value,
      key: enumInstance.label,
      label: enumInstance.description,
    });
  }, new Map<number, WalleSpec.FrameMeta>());

  constructor(blob: Blob) {
    this.#blob = blob;
  }

  #blob: Blob;
  #meta?: WalleSpec.FrameMeta;

  /** 获取当前帧的元数据 */
  readonly getMeta = async () => {
    if (this.#meta) return structuredClone(this.#meta);
    const stream = this.#blob.stream();
    const reader = stream.getReader();
    const { value: chunk } = await reader.read();
    const view = new DataView(chunk!.buffer);
    const typeNumber = view.getUint32(4, false);
    const type = FrameHelper.#TYPES.get(typeNumber);
    this.#meta = type ?? { label: "未知", key: "UNKNOWN", value: -1 };
    await reader.cancel();
    return structuredClone(this.#meta);
  };
}
