import { Enum } from './utils/enum'

export class FrameHelper implements WalleSpec.FrameHelper {
  static readonly SERVICE_TYPE_UNKNOWN = new Enum(-1, 'SERVICE_TYPE_UNKNOWN', '未知数据')
  static readonly SERVICE_TYPE_AUDIO_V1 = new Enum(1, 'SERVICE_TYPE_AUDIO_V1', '音频流(V1)')
  static readonly SERVICE_TYPE_VIDEO_V1 = new Enum(2, 'SERVICE_TYPE_VIDEO_V1', '视频流(V1)')

  // V0 类型的枚举
  static readonly SERVICE_TYPE_AUDIO_V0 = new Enum(10002, 'SERVICE_TYPE_AUDIO_V0', '音频流(V0)')
  static readonly SERVICE_TYPE_VIDEO_V0 = new Enum(10003, 'SERVICE_TYPE_VIDEO_V0', '视频流(V0)')

  /** 支持的类型 */
  static readonly #TYPES = [
    FrameHelper.SERVICE_TYPE_UNKNOWN,
    FrameHelper.SERVICE_TYPE_AUDIO_V1,
    FrameHelper.SERVICE_TYPE_VIDEO_V1,
    FrameHelper.SERVICE_TYPE_AUDIO_V0,
    FrameHelper.SERVICE_TYPE_VIDEO_V0
  ].reduce((map, enumInstance) => {
    return map.set(enumInstance.value, {
      value: enumInstance.value,
      key: enumInstance.label,
      label: enumInstance.description
    })
  }, new Map<number, WalleSpec.FrameMeta>())

  constructor(blob: Blob) {
    this.#blob = blob
  }

  #blob: Blob
  #meta?: WalleSpec.FrameMeta

  /** 获取当前帧的元数据 */
  readonly getMeta = async () => {
    if (this.#meta) return structuredClone(this.#meta)
    const stream = this.#blob.stream()
    const reader = stream.getReader()
    const { value: chunk } = await reader.read()
    const view = new DataView(chunk!.buffer)

    // 首先尝试 V1 探测 (offset 4)
    let typeNumber = view.getUint32(4, false)
    let type = FrameHelper.#TYPES.get(typeNumber)

    // 如果 V1 探测失败，尝试 V0 探测 (offset 0)
    if (!type || (typeNumber !== 1 && typeNumber !== 2)) {
      typeNumber = view.getUint32(0, false)
      type = FrameHelper.#TYPES.get(typeNumber)
    }

    this.#meta = type ?? { label: '未知', key: 'UNKNOWN', value: -1 }
    await reader.cancel()
    return structuredClone(this.#meta)
  }
}
