import { Subject } from "rxjs";

/**
 * ### 音频帧解码器
 * - 该解码器依赖固定的文件头
 */
export class WalleAudioDecoder implements WalleSpec.Decoder {
  #frame$ = new Subject<WalleSpec.Audio>();
  get frame$() {
    return this.#frame$.pipe();
  }

  #error$ = new Subject<Error>();
  get error$() {
    return this.#error$.pipe();
  }

  #getMeta = (view: DataView) => {
    const meta: WalleSpec.AudioMeta = {
      type: view.getUint32(4, false),
      data_len: view.getInt32(8, false),
      vad_status: view.getInt32(12, false),
    };
    return {
      meta,
      length: 8,
    };
  };

  decode = async (frame: Blob | ArrayBuffer) => {
    try {
      const buffer =
        frame instanceof ArrayBuffer ? frame : await frame.arrayBuffer();
      const view = new DataView(buffer);

      const { meta, length: metaLength } = this.#getMeta(view);

      /** 音频数据 */
      const audio_data = view.buffer.slice(
        metaLength,
        metaLength + meta.data_len
      );

      this.#frame$.next({
        ...meta,
        frame: audio_data,
      });
    } catch (err) {
      this.#error$.next(err instanceof Error ? err : new Error(`${err}`));
    }
  };
}
