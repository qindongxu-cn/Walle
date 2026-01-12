import { Subject } from 'rxjs'

/**
 * ### 音频帧解码器
 * - 该解码器依赖固定的文件头
 */
export class WalleAudioDecoder implements WalleSpec.Decoder {
  #frame$ = new Subject<WalleSpec.Audio>()
  get frame$() {
    return this.#frame$.pipe()
  }

  #error$ = new Subject<Error>()
  get error$() {
    return this.#error$.pipe()
  }

  #getMeta = (view: DataView) => {
    // 尝试 V1 探测
    const typeV1 = view.getUint32(4, false)
    if (typeV1 === 1) {
      const meta: WalleSpec.AudioMeta = {
        /** 数据类型 */
        type: typeV1,
        /** 帧数据长度 (字节数) */
        data_len: view.getInt32(8, false),
        /** VAD 状态值 0:None 1:Begin 2:continue 3:End */
        vad_status: view.getInt32(12, false)
      }
      return {
        meta,
        length: 8 // 恢复原始 V1 的硬编码长度
      }
    }

    // 尝试 V0 探测
    const typeV0 = view.getUint32(0, false)
    if (typeV0 === 10002) {
      const meta: WalleSpec.AudioMeta = {
        /** v0 数据类型 id */
        service_id: typeV0,
        /** 帧数据长度 (字节数) */
        data_len: view.getInt32(4, false),
        /** VAD 状态值 0:None 1:Begin 2:continue 3:End */
        vad_status: view.getInt32(8, false)
      }
      return {
        meta,
        length: 12 // V0 头部长度
      }
    }

    // 默认回退到 V1 逻辑，但使用 16 作为长度 (修正原有的 8 可能存在的 bug)
    const meta: WalleSpec.AudioMeta = {
      /** 数据类型 */
      type: view.getUint32(4, false),
      /** 帧数据长度 (字节数) */
      data_len: view.getInt32(8, false),
      /** VAD 状态值 0:None 1:Begin 2:continue 3:End */
      vad_status: view.getInt32(12, false)
    }
    return {
      meta,
      length: 8 // 恢复原始 V1 的硬编码长度
    }
  }

  decode = async (frame: Blob | ArrayBuffer) => {
    try {
      // 检查 frame 是否有效
      if (!frame) {
        console.warn(':::[WalleAudioDecoder] Invalid frame: frame is null or undefined')
        return
      }

      // 确保 frame 是 Blob 或 ArrayBuffer
      if (!(frame instanceof Blob) && !(frame instanceof ArrayBuffer)) {
        console.warn(':::[WalleAudioDecoder] Invalid frame type:', typeof frame)
        return
      }

      const buffer = frame instanceof ArrayBuffer ? frame : await frame.arrayBuffer()
      const view = new DataView(buffer)

      const { meta, length: metaLength } = this.#getMeta(view)

      /** 音频数据 */
      const audio_data = view.buffer.slice(metaLength, metaLength + meta.data_len)

      this.#frame$.next({
        ...meta,
        frame: audio_data
      })
    } catch (err) {
      this.#error$.next(err instanceof Error ? err : new Error(`${err}`))
    }
  }
}
