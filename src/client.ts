import { FrameHelper } from './frame-helper'
import { VideoRenderer, VideoRendererOptions } from './renderers'
import { Enum } from './utils/enum'
import { EventEmitter } from './utils/event-emitter'
import { parseASRResult } from './utils/asr-parser'
import { audioDecodeWorkerURL, videoDecodeWorkerURL } from './workers'

const { SERVICE_TYPE_AUDIO_V1, SERVICE_TYPE_VIDEO_V1, SERVICE_TYPE_AUDIO_V0, SERVICE_TYPE_VIDEO_V0 } = FrameHelper

/**
 * ### 瓦力客户端
 */
export class Client extends EventEmitter<WalleSpec.ClientEventMap> {
  #CLOSE_REASONS = {
    UNPROMPTED: new Enum(1000, 'UNPROMPTED', '主动关闭')
  } as const

  #socket: WebSocket | null = null
  get socket() {
    return this.#socket
  }

  #renderer: VideoRenderer | null = null

  /** 当前连接的 URL，用于自动重连 */
  #connectUrl: string | null = null

  /** 是否为主动断开，主动断开不会触发重连 */
  #isManualClose: boolean = false

  /** 心跳定时器 */
  #heartbeatTimer: number | null = null

  /** 重连定时器 */
  #reconnectTimer: number | null = null

  /** 是否正在重连中 */
  #isReconnecting: boolean = false

  /** 重连计数器 */
  #reconnectCount: number = 0

  /** 是否已报告过首次连接失败的异常 */
  #hasReportedInitialError: boolean = false

  /** 解码策略 */
  #decoderWorkerMap = (() => {
    // const audioWorker = new Worker(audioDecodeWorkerURL, { name: '音频解码线程', type: 'module' })
    const audioWorker = new audioDecodeWorkerURL({ name: '音频解码线程' })
    audioWorker.addEventListener('message', (ev: MessageEvent<WalleSpec.WorkerOutput<WalleSpec.Audio>>) => {
      if (ev.data.error) return this.subjectNext('error', new Error(ev.data.message ?? '音频解码失败，原因未知'))
      this.subjectNext('audioframe', ev.data.payload as WalleSpec.Audio)
    })
    // const videoWorker = new Worker(videoDecodeWorkerURL, { name: '视频解码线程', type: 'module' })
    const videoWorker = new videoDecodeWorkerURL({ name: '视频解码线程' })
    videoWorker.addEventListener('message', (ev: MessageEvent<WalleSpec.WorkerOutput<WalleSpec.Video>>) => {
      if (ev.data.error) return this.subjectNext('error', new Error(ev.data.message ?? '视频解码失败，原因未知'))
      this.subjectNext('videoframe', ev.data.payload as WalleSpec.Video)
    })
    return new Map<Enum['value'], Worker>([
      [SERVICE_TYPE_AUDIO_V1.value, audioWorker],
      [SERVICE_TYPE_VIDEO_V1.value, videoWorker],
      [SERVICE_TYPE_AUDIO_V0.value, audioWorker],
      [SERVICE_TYPE_VIDEO_V0.value, videoWorker]
    ])
  })()

  /** 状态改变 promise */
  #stateChangePromise: Promise<void> | null = null

  #createErrorFromEvent = (ev: Event, socket: WebSocket): Error => {
    if (ev instanceof ErrorEvent) return new Error(ev.message)
    return new Error(
      JSON.stringify({
        type: ev.type,
        timeStamp: ev.timeStamp,
        url: socket.url,
        readState: socket.readyState
      })
    )
  }

  /** 清理心跳定时器 */
  #clearHeartbeat = () => {
    if (this.#heartbeatTimer !== null) {
      window.clearInterval(this.#heartbeatTimer)
      this.#heartbeatTimer = null
    }
  }

  /** 清理重连定时器 */
  #clearReconnect = () => {
    if (this.#reconnectTimer !== null) {
      window.clearTimeout(this.#reconnectTimer)
      this.#reconnectTimer = null
    }
  }

  /** 启动心跳 */
  #startHeartbeat = (socket: WebSocket) => {
    this.#clearHeartbeat()
    // TODO 临时心跳处理，后续应该使用配置中的心跳配置, walle设备目前没有返回PONG响应
    this.#heartbeatTimer = window.setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send('PING')
      } else {
        this.#clearHeartbeat()
      }
    }, 5000)
  }

  /** 尝试自动重连 */
  #attemptReconnect = () => {
    // 如果已手动关闭、正在重连、没有连接URL，则不重连
    if (this.#isManualClose || this.#isReconnecting || !this.#connectUrl) {
      return
    }

    // 增加重连计数
    this.#reconnectCount++

    // 根据重连次数计算延迟时间
    // 第1~10次: 间隔5s进行重连
    // 第11~30次: 间隔10s进行重连
    // 第31~n次: 间隔60s进行重连
    let delay: number
    if (this.#reconnectCount <= 10) {
      delay = 5000 // 5秒
    } else if (this.#reconnectCount <= 30) {
      delay = 10000 // 10秒
    } else {
      delay = 60000 // 60秒
    }

    this.#isReconnecting = true

    this.#reconnectTimer = window.setTimeout(async () => {
      if (!this.#connectUrl) return
      try {
        this.subjectNext('statechange', WebSocket.CONNECTING)
        await this.connect(this.#connectUrl)
        this.#isReconnecting = false
        if (this.#socket) {
          this.subjectNext('open', this.#socket)
        }
      } catch (error) {
        this.#isReconnecting = false
        // 重连失败时打印重连次数，不抛出异常
        console.log(`[Walle] 重连失败，当前重连次数: ${this.#reconnectCount}`)
        // 重连失败后继续尝试重连
        this.#attemptReconnect()
      }
    }, delay)
  }

  #processMessage = async (ev: MessageEvent<WalleSpec.ClientMessageData>) => {
    const payload = ev.data
    if (typeof payload === 'string') {
      // 处理心跳响应 PONG
      if (payload === 'PONG') {
        // 收到服务器的心跳响应，连接正常
        return
      }

      try {
        // 使用新的解析器来兼容不同版本的ASR数据
        const asrResult = parseASRResult(payload)
        this.subjectNext('asrResult', asrResult)
      } catch (error) {
        this.subjectNext('error', new Error(`ASR数据解析失败: ${error instanceof Error ? error.message : '未知错误'}`))
      }
      return
    }
    const helper = new FrameHelper(payload)
    const meta = await helper.getMeta()
    const worker = this.#decoderWorkerMap.get(meta.value)
    if (!worker) return
    const buffer = await payload.arrayBuffer()
    worker.postMessage(buffer, [buffer])
  }

  /** 渲染到画板 */
  renderTo = (canvas: HTMLCanvasElement, options: VideoRendererOptions = {}) => {
    this.#renderer = new VideoRenderer(this, canvas, options)
  }

  /** 取消画板渲染 */
  cancelRender = () => {
    if (!this.#renderer) return
    this.#renderer.destory()
    this.#renderer = null
  }

  /** 连接瓦力服务 */
  connect = async (url: string): Promise<void> => {
    await this.#stateChangePromise

    // 清理重连定时器
    this.#clearReconnect()

    if (this.#socket) {
      // 临时设置手动关闭标志，避免在关闭旧连接时触发重连
      const wasManual = this.#isManualClose
      const wasReconnecting = this.#isReconnecting
      this.#isManualClose = true
      this.#isReconnecting = false
      await this.close()
      // 恢复状态：如果是重连场景，恢复重连标志
      this.#isManualClose = wasManual
      this.#isReconnecting = wasReconnecting
    }

    // 保存连接 URL，用于自动重连
    this.#connectUrl = url
    // 只有在非重连场景下才重置手动关闭标志
    if (!this.#isReconnecting) {
      this.#isManualClose = false
    }

    const controller = new AbortController()

    // 在重连场景下，尝试静默处理 WebSocket 错误
    // 通过 window.addEventListener('error') 来临时拦截浏览器打印的 WebSocket 连接失败的错误
    let errorHandler: ((event: ErrorEvent) => void) | null = null
    if (this.#isReconnecting) {
      errorHandler = (event: ErrorEvent) => {
        // 拦截 WebSocket 连接失败的错误
        const errorMsg = event.message || ''
        if (errorMsg.includes('WebSocket connection to') && errorMsg.includes('failed')) {
          event.stopImmediatePropagation() // 阻止事件传播
          event.preventDefault() // 阻止默认行为
        }
      }
      window.addEventListener('error', errorHandler, { capture: true })
    }

    const socket = new WebSocket(url)
    this.subjectNext('statechange', WebSocket.CONNECTING)
    this.#socket = socket

    const promise = new Promise<void>((resolve, reject) => {
      socket.addEventListener(
        'open',
        () => {
          // 移除错误监听器
          if (errorHandler) {
            window.removeEventListener('error', errorHandler, {
              capture: true
            })
            errorHandler = null
          }
          this.#startHeartbeat(socket)
          this.#isReconnecting = false
          // 重连成功后，重连计数器清零，重置首次错误标志
          this.#reconnectCount = 0
          this.#hasReportedInitialError = false
          resolve()
          this.subjectNext('open', socket)
          controller.abort()
        },
        { once: true, signal: controller.signal }
      )

      // 连接建立前的错误处理
      socket.addEventListener(
        'error',
        () => {
          // 移除错误监听器
          if (errorHandler) {
            window.removeEventListener('error', errorHandler, {
              capture: true
            })
            errorHandler = null
          }
          // 只在第一次连接失败时标记已报告，后续重连失败由重连逻辑处理
          if (!this.#isReconnecting && !this.#hasReportedInitialError) {
            this.#hasReportedInitialError = true
          }
          // 无论是否重连，都 reject，让调用方处理
          // 重连场景下会在 #attemptReconnect 的 catch 中处理，只打印重连次数
          reject(new Error(`连接地址 "${socket.url}" 失败`))
          controller.abort()
        },
        { once: true, signal: controller.signal }
      )
    }).finally(() => {
      // 确保移除错误监听器
      if (errorHandler) {
        window.removeEventListener('error', errorHandler, { capture: true })
        errorHandler = null
      }
      this.#stateChangePromise = null
    })

    socket.addEventListener('message', this.#processMessage)

    socket.addEventListener(
      'close',
      () => {
        this.#clearHeartbeat()
        this.subjectNext('statechange', WebSocket.CLOSED)
        this.#socket = null
        this.subjectNext('closed', socket)

        // 如果不是主动关闭，且不是正在重连，则尝试自动重连
        if (!this.#isManualClose && !this.#isReconnecting && this.#reconnectCount === 0) {
          this.#attemptReconnect()
        }
      },
      { once: true }
    )

    this.#stateChangePromise = promise

    await promise

    // 连接建立后的错误发送给 subject error
    socket.addEventListener('error', ev => {
      this.subjectNext('error', this.#createErrorFromEvent(ev, socket))
    })
  }

  /**
   * ### 断开瓦力服务
   * 主动断开不会触发重连
   */
  close = async (): Promise<void> => {
    await this.#stateChangePromise

    // 清理重连定时器
    this.#clearReconnect()

    const socket = this.#socket

    if (!socket || socket.readyState === WebSocket.CLOSED) {
      this.#isManualClose = false
      return
    }

    // 标记为主动关闭，避免触发重连
    this.#isManualClose = true
    this.#clearHeartbeat()

    const { UNPROMPTED } = this.#CLOSE_REASONS
    const controller = new AbortController()

    socket.close(UNPROMPTED.value, UNPROMPTED.label)
    this.subjectNext('statechange', WebSocket.CLOSING)

    const promise = new Promise<void>((resolve, reject) => {
      socket.addEventListener(
        'close',
        () => {
          this.#clearHeartbeat()
          this.subjectNext('statechange', WebSocket.CLOSED)
          this.#connectUrl = null
          this.#isManualClose = false
          resolve()
          controller.abort()
        },
        { once: true, signal: controller.signal }
      )

      socket.addEventListener(
        'error',
        () => {
          reject(new Error(`关闭连接 "${socket.url}" 失败`))
          controller.abort()
        },
        { once: true, signal: controller.signal }
      )
    }).finally(() => {
      this.#stateChangePromise = null
    })

    this.#stateChangePromise = promise

    await promise
  }

  /**
   * 结束客户端生命周期，清理所有资源占用。
   */
  destory = async () => {
    this.cancelRender()
    this.#clearHeartbeat()
    this.#clearReconnect()
    await this.close()
  }

  constructor() {
    super()
  }

  // 显式声明继承的方法，确保 TypeScript 正确识别
  declare on: EventEmitter<WalleSpec.ClientEventMap>['on']
  declare off: EventEmitter<WalleSpec.ClientEventMap>['off']
  declare once: EventEmitter<WalleSpec.ClientEventMap>['once']
  declare subject: EventEmitter<WalleSpec.ClientEventMap>['subject']
}
