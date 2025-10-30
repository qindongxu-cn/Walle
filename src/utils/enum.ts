export class Enum implements WalleSpec.Enum {
  constructor(
    /** 枚举识别值 */
    value: number,
    /** 枚举名称 */
    label: string,
    /**
     * 枚举描述信息
     * @default label
     */
    description = label
  ) {
    this.#value = value
    this.#label = label
    this.#description = description
  }

  #value: number

  /** 枚举识别值 */
  get value() {
    return this.#value
  }

  #label: string

  /** 枚举名称 */
  get label() {
    return this.#label
  }

  #description = ''

  /** 枚举描述信息 */
  get description() {
    return this.#description
  }
}
