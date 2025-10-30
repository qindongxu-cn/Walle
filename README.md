# 瓦力 SDK

## 1. 简述

《瓦力》项目是一个实现了对特定音频、视频或语音识别结果流数据的解码，并对开发者提供了部分低级接口的工具库。

## 2. 目录结构

```ts
- src                // 根目录
  - decoders         // 解码器
  - renderers        // 调试渲染器
  - utils            // 内部工具
  - workers          // 解码线程
  - client.ts        // 客户端代码（是的，瓦力可以有服务端模式，但是目前暂无实现）
  - frame-helper.ts  // 帧工具类
  - index.d.ts       // 类型声明
  - index.ts         // 导出文件
  - package.json     // 这个不用解释了吧
  - tsconfig.json    // 这个也不用解释了吧
```

## 3. 协议

### 3.1 连接

瓦力 SDK 通过 `WebSocket` 与瓦力服务建立连接

### 3.2 心跳

暂无规定

### 3.3 视频帧

#### 事件类型: `MessageEvent<Blob>`

#### 二进制结构（大端模式）

| 字段名称   | 字节长度              | 字段含义               |
| ---------- | --------------------- | ---------------------- |
| service_id | 4                     | 数据帧类型             |
| index      | 8                     | 图像帧序               |
| data_len   | 4                     | 图像数据长度           |
| img_width  | 4                     | 图像宽度               |
| img_height | 4                     | 图像高度               |
| has_face   | 4                     | 当前帧中是否存在人脸   |
| face_num   | 4                     | 图像中人脸数量         |
| face_index | 8                     | 人脸 index             |
| w          | 4                     | 人脸宽度 (px)          |
| h          | 4                     | 人脸高度 (px)          |
| x          | 4                     | 人脸起始 x 坐标        |
| y          | 4                     | 人脸起始 y 坐标        |
| mouth_w    | 4                     | 嘴唇宽度 (px)          |
| mouth_h    | 4                     | 嘴唇高度 (px)          |
| mouth_x    | 4                     | 嘴唇起始 x 坐标        |
| mouth_y    | 4                     | 最初起始 y 坐标        |
| video_data | 总长度 - 以上数据长度 | 视频帧编码格式 (H.264) |

### 3.4 音频帧

#### 事件类型: `MessageEvent<Blob>`

#### 二进制结构（大端模式）

| 字段名称   | 字节长度              | 字段含义                                            |
| ---------- | --------------------- | --------------------------------------------------- |
| service_id | 4                     | 数据帧类型                                          |
| data_len   | 4                     | 音频数据长度                                        |
| vad_status | 4                     | VAD 状态值 (0: None, 1: Begin, 2: Continue, 3: End) |
| audio_data | 总长度 - 以上数据长度 | 音频数据负载                                        |

### 3.5 语音识别结果

#### 事件类型: `MessageEvent<string>`

- 参考: [讯飞标准文档](https://aiui-doc.xf-yun.com/project-1/doc-16/)
- JSON 解析样例：

```json
{
  "text": {
    "bg": 0,
    "ed": 0,
    "ls": false,
    "pgs": "rpl",
    "rg": [1, 5],
    "rst": "pgs",
    "sn": 6,
    "ws": [
      { "bg": 0, "cw": [{ "sc": 0, "w": "深" }] },
      { "bg": 0, "cw": [{ "sc": 0, "w": "圳" }] },
      { "bg": 0, "cw": [{ "sc": 0, "w": "天" }] },
      { "bg": 0, "cw": [{ "sc": 0, "w": "气" }] },
      { "bg": 0, "cw": [{ "sc": 0, "w": "怎" }] },
      { "bg": 0, "cw": [{ "sc": 0, "w": "么" }] },
      { "bg": 0, "cw": [{ "sc": 0, "w": "样" }] }
    ]
  },
  "filtered": "深圳天气怎么样"
}
```

## 4. 调用样例

`main.vue`

```html
<template>
  <canvas ref="canvasRef" />
</template>
```

`main.ts`

```ts
import { WalleClient } from 'walle'

const canvasRef = shallowRef<HTMLCanvasElement>()

onMounted(async () => {
  if (!canvasRef.value)
    return

  // 直接实例化
  const client = new WalleClient()

  // 连接瓦力服务
  await client.connect('ws://127.0.0.1:39999')

  // 可选: 渲染调试信息（包括人脸框、FPS 等）
  client.renderTo(canvasRef.value, {
    fps: true, // 可选: 渲染 FPS 值
  })

  // 可选: 取消渲染调试信息
  client.cancelRender()

  // 关闭连接（主动关闭不会触发重连，此外也不会停止调试渲染）
  client.close()

  // 销毁客户端，释放所有资源占用（包括调试渲染）
  client.destory()

  // 原始 WebSocket 对象
  client.socket

  const ctx = canvasRef.value.getContext('2d')

  // 订阅视频帧（你可以自行绘制解码后的视频帧）
  client.subject('videoframe').subscribe((video) => {
    ctx.clearReact(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.drawImage(video.frame, 0, 0)
    // 注意！当你订阅 frame 之后，必须在使用后销毁 frame！
    video.frame.close()
  })

  // 订阅音频帧（音频帧可能需要根据业务要求发送给单独的唤醒服务）
  client.subject('audioframe').subscribe((audio) => {
    someAwakenServer.send(audio.frame)
  })

  // 订阅语音识别结果（关于 ASR 识别对象的更详细信息请参见其 TS 声明）
  client.subject('asrResult').subscribe((result) => {
    console.log(result.filtered)
  })

  // 还有其他可订阅事件请参见 Walle TS 生命中的 ClientEventMap 接口
})
```

## 5. SDK 开发指南

### 5.1 解码器

重点关注 `src/decoders` 下对应的解码器类中的 `#getMeta` 私有方法，该方法实现解码器对二进制内容的文件头解析，是解码器获取实际内容的根基。

此外，你需要实现 `decode` 方法以便在 `Worker` 中调用，以及根据需要暴露对应的数据事件。

### 5.2 RxJS

为什么选择 `RxJS` 而不是 `EventListener` 风格？

用一个示例就能解答这个问题，假设我们要做一个​【搜索框实时建议​（输入时延迟500ms发送请求，忽略连续快速输入）​】的需求。

#### A. 先看看传统做法

`html`

```html
<input type="text" id="searchInput">
```

`typescript`

```typescript
let timer: number | null = null
let lastRequest: string = ''

const searchInput = document.getElementById('searchInput')

searchInput.addEventListener('input', (e) => {
  const query = e.target.value.trim()
  // 1. 手动过滤条件
  if (query.length < 3)
    return

  // 2. 手动防抖逻辑
  clearTimeout(timer)
  timer = setTimeout(() => {
    // 3. 避免重复请求
    if (lastRequest === query)
      return
    lastRequest = query
    // 实际请求逻辑
    fetch(`/search?q=${query}`)
      .then(response => response.json())
      .then(data => console.log("结果:", data))
      // 4. 需单独错误处理
      .catch(err => console.error("请求失败", err))
  }, 500)
})

// 5. 需手动移除监听 (易遗忘导致内存泄漏)
searchInput.removeEventListener('input')
```

是不是感觉挺破碎的？

#### B. 再看看 RxJS 做法

```typescript
import { fromEvent, debounceTime, filter, distinctUntilChanged, switchMap } from 'rxjs'

const searchInput = document.getElementById('searchInput')

// 创建事件流
const search$ = fromEvent(searchInput, 'input').pipe(
  map(e => e.target.value.trim()),           // 提取值
  filter(query => query.length >= 3),        // 自动过滤
  debounceTime(500),                         // 自动防抖
  distinctUntilChanged(),                    // 忽略相同值
  switchMap((query) => {                     // 自动取消未完成请求
    return from(fetch(`/search?q=${query}`).then(res => res.json()))
  }),
)

// 统一订阅管理
const subscription = search$.subscribe({
  next: data => console.log('结果', data),
  error: err => console.error('统一错误处理', err) // 集中错误处理
})

// 取消订阅 (简单可靠)
subscription.unsubscribe()
```

代码简单而优雅，当然，这有赖于开发者对 RxJS 操作符的了解，存在一定开发门槛。但我相信，在应对后续越来越复杂的业务逻辑时，这种投入绝对是值得的。

### 5.3 最佳实践

  1. 使用 `TypeScript` 进行开发
  2. 不要节省字数，成员或方法的命名应该表明其意图

```typescript
// Bad ×
declare const setConfig: () => void

// Good ×
declare const setVideoConfig: () => void
```
