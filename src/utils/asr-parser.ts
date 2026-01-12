/**
 * ASR结果解析工具
 * 用于兼容不同版本的ASR数据格式
 */

/**
 * 判断是否为ASR版本2格式
 * @param data 原始数据
 * @returns 是否为版本2格式
 */
function isASRV2(data: unknown): data is WalleSpec.ASRResultV2 {
  return (
    typeof data === 'object' &&
    data !== null &&
    'action' in data &&
    (data as any).action === 'asr' &&
    'data' in data &&
    typeof (data as any).data === 'string'
  )
}

/**
 * 判断是否为ASR版本1格式
 * @param data 原始数据
 * @returns 是否为版本1格式
 */
function isASRV1(data: unknown): data is WalleSpec.ASRResult {
  return (
    typeof data === 'object' &&
    data !== null &&
    'text' in data &&
    'filtered' in data &&
    typeof (data as any).filtered === 'string'
  )
}

/**
 * 将ASR版本2数据转换为版本1格式
 * @param v2Data 版本2数据
 * @returns 版本1格式的数据
 */
function convertV2ToV1(v2Data: WalleSpec.ASRResultV2): WalleSpec.ASRResult {
  try {
    const parsedData = JSON.parse(v2Data.data) as WalleSpec.ASRResultV2Data
    return {
      text: parsedData.text,
      filtered: parsedData.filtered
    }
  } catch (error) {
    throw new Error(`无法解析ASR版本2数据: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}

/**
 * 解析ASR结果，支持版本1和版本2格式
 * @param rawData 原始ASR数据（JSON字符串或已解析的对象）
 * @returns 统一的ASR结果（版本1格式）
 * @throws 当数据格式不符合任何已知版本时抛出错误
 */
export function parseASRResult(rawData: string | unknown): WalleSpec.ASRResult {
  let parsedData: unknown

  // 如果是字符串，先解析为对象
  if (typeof rawData === 'string') {
    try {
      parsedData = JSON.parse(rawData)
    } catch (error) {
      throw new Error(`无法解析ASR JSON数据: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  } else {
    parsedData = rawData
  }

  // 检查是否为版本1格式
  if (isASRV1(parsedData)) {
    return parsedData
  }

  // 检查是否为版本2格式
  if (isASRV2(parsedData)) {
    return convertV2ToV1(parsedData)
  }

  // 如果都不匹配，抛出错误
  throw new Error('无法识别的ASR数据格式，请检查数据结构是否正确')
}

/**
 * 获取ASR版本2数据的扩展信息（如sid, speak_index）
 * @param rawData 原始ASR数据
 * @returns 扩展信息对象，如果不是版本2则返回null
 */
export function getASRV2ExtendedInfo(rawData: string | unknown): { sid: string; speak_index: string } | null {
  let parsedData: unknown

  // 如果是字符串，先解析为对象
  if (typeof rawData === 'string') {
    try {
      parsedData = JSON.parse(rawData)
    } catch {
      return null
    }
  } else {
    parsedData = rawData
  }

  // 只有版本2才有扩展信息
  if (!isASRV2(parsedData)) {
    return null
  }

  try {
    const v2Data = JSON.parse(parsedData.data) as WalleSpec.ASRResultV2Data
    return {
      sid: v2Data.sid,
      speak_index: v2Data.speak_index
    }
  } catch {
    return null
  }
}
