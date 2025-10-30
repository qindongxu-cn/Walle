# ASR 版本兼容性文档

本文档说明了如何使用 Walle SDK 处理不同版本的 ASR（语音识别）数据格式。

## 支持的版本

### 版本 1（原格式）

直接包含 `text` 和 `filtered` 字段的对象：

```json
{
  "text": {
    "bg": 0,
    "ed": 0,
    "ls": false,
    "pgs": "apd",
    "rst": "rlt",
    "sn": 1,
    "ws": [
      {
        "bg": 0,
        "cw": [{ "sc": 0, "w": "你好" }]
      }
    ]
  },
  "filtered": "你好"
}
```

### 版本 2（新格式）

包含 `action` 和 `data` 字段，其中 `data` 是 JSON 字符串：

```json
{
  "action": "asr",
  "data": "{\"filtered\":\"你好\",\"sid\":\"cid000194b3@dx1990978ec6dd010003\",\"speak_index\":\"0\",\"text\":{\"bg\":0,\"ed\":0,\"ls\":false,\"pgs\":\"apd\",\"rst\":\"rlt\",\"sn\":1,\"ws\":[{\"bg\":0,\"cw\":[{\"sc\":0,\"w\":\"你好\"}]}]}}"
}
```

## 使用方法

### 自动兼容处理

SDK 已经内置了自动兼容处理，您无需修改现有代码。`Client` 类会自动识别并处理两种格式：

```typescript
import { Client } from 'walle'

const client = new Client()

// 监听ASR结果（统一为版本1格式）
client.on('asrResult', (result) => {
  console.log('识别文本:', result.filtered)
  console.log('详细信息:', result.text)
})

await client.connect('ws://your-server-url')
```

### 手动解析工具

如果您需要在其他地方处理 ASR 数据，可以使用提供的解析工具：

```typescript
import { parseASRResult, getASRV2ExtendedInfo } from 'walle'

// 解析任意版本的ASR数据
const result = parseASRResult(rawAsrData)
console.log('统一格式的结果:', result)

// 获取版本2的扩展信息（如果适用）
const extendedInfo = getASRV2ExtendedInfo(rawAsrData)
if (extendedInfo) {
  console.log('会话ID:', extendedInfo.sid)
  console.log('说话索引:', extendedInfo.speak_index)
}
```

## API 参考

### `parseASRResult(rawData: string | unknown): WalleSpec.ASRResult`

解析 ASR 结果，支持版本 1 和版本 2 格式。

**参数:**

- `rawData`: 原始 ASR 数据（可以是 JSON 字符串或已解析的对象）

**返回值:**

- 统一的 ASR 结果（版本 1 格式）

**异常:**

- 当数据格式不符合任何已知版本时抛出错误

### `getASRV2ExtendedInfo(rawData: string | unknown): {sid: string; speak_index: string} | null`

获取 ASR 版本 2 数据的扩展信息。

**参数:**

- `rawData`: 原始 ASR 数据

**返回值:**

- 如果是版本 2 数据，返回包含 `sid` 和 `speak_index` 的对象
- 如果不是版本 2 数据，返回 `null`

## 版本 2 新增字段

版本 2 格式在原有字段基础上新增了以下字段：

- `sid`: 会话 ID，用于标识当前对话会话
- `speak_index`: 说话索引，用于标识发言的顺序

这些字段可以通过 `getASRV2ExtendedInfo` 函数获取。

## 向后兼容性

- ✅ 现有代码无需修改，自动兼容两种格式
- ✅ 事件监听器接收到的数据格式保持不变（版本 1 格式）
- ✅ 类型定义向后兼容，不会破坏现有类型检查

## 错误处理

当遇到无法识别的数据格式时，SDK 会：

1. 在客户端自动处理时：触发 `error` 事件
2. 在手动解析时：抛出描述性错误

建议在生产环境中添加适当的错误处理逻辑：

```typescript
client.on('error', (error) => {
  console.error('ASR处理错误:', error.message)
  // 添加你的错误处理逻辑
})
```


