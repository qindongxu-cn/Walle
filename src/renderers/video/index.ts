import { bufferTime, map, withLatestFrom } from 'rxjs'
import type { Subscription } from 'rxjs'
import type { Client as WalleClient } from '../../client'

export interface VideoRendererOptions {
  /**
   * 是否显示 fps
   * @default false
   */
  fps?:
    | false
    | {
        /**
         * 计算间隔 (ms)
         * @default 1000
         */
        gap: number
        /**
         * 文本尺寸 (px)
         * @default 12
         */
        size: number
        /**
         * 文本渲染区域的左上角起始坐标
         * @default [12,12]
         */
        layout: [x: number, y: number]
      }
}

export class VideoRenderer {
  constructor(client: WalleClient, canvas: HTMLCanvasElement, options: VideoRendererOptions = {}) {
    const { fps = false } = options
    const ctx = canvas.getContext('2d')!
    this.#ctx = ctx
    this.#animationId = requestAnimationFrame(this.#draw)

    const { gap: fpsCalculateGap } = fps || {
      gap: 1000,
      layout: [12, 12],
      size: 12
    }

    this.#options = {
      fps
    }

    // fps 计算逻辑
    const calculatedFPS$ = client.subject('videoframe').pipe(
      bufferTime(fpsCalculateGap),
      map((events) => events.length)
    )

    // 合并 fps 渲染
    const bufferToBMP = client
      .subject('videoframe')
      .pipe(withLatestFrom(calculatedFPS$))
      .subscribe(([frame, calculatedFPS]) => {
        this.#fps = calculatedFPS
        this.#videoFrameInfo?.frame.close()
        this.#videoFrameInfo = frame
      })
    this.#subscriptions.add(bufferToBMP)
  }

  #offscreen = new OffscreenCanvas(0, 0)
  #offscreenCtx = this.#offscreen.getContext('2d')!
  #ctx: CanvasRenderingContext2D
  #animationId: number
  #options: Required<VideoRendererOptions>
  #fps = 0
  #videoFrameInfo: WalleSpec.Video | null = null
  #subscriptions = new Set<Subscription>()

  #draw = () => {
    const info = this.#videoFrameInfo

    // 绘制人脸标识
    if (info?.frame.visibleRect) {
      const { frame, has_face, face_x, face_y, face_w, face_h, mouth_x, mouth_y, mouth_w, mouth_h } = info
      this.#offscreen.width = frame.displayWidth
      this.#offscreen.height = frame.displayHeight
      this.#offscreenCtx.clearRect(0, 0, frame.displayWidth, frame.displayHeight)
      this.#offscreenCtx.drawImage(frame, 0, 0)
      // 绘制脸部标识
      if (has_face) {
        this.#offscreenCtx.lineWidth = 2
        this.#offscreenCtx.strokeStyle = '#FF0'
        this.#offscreenCtx.strokeRect(
          face_x - this.#offscreenCtx.lineWidth / 2,
          face_y - this.#offscreenCtx.lineWidth / 2,
          face_w,
          face_h
        )
        this.#offscreenCtx.strokeStyle = '#0CF'
        this.#offscreenCtx.strokeRect(mouth_x, mouth_y, mouth_w, mouth_h)
      }
    }

    // 绘制 fps
    if (this.#options.fps) {
      const { layout, size } = this.#options.fps
      this.#offscreenCtx.font = `${size}px math`
      const text = `FPS: ${this.#fps}`
      const { actualBoundingBoxAscent, actualBoundingBoxDescent, actualBoundingBoxLeft, actualBoundingBoxRight } =
        this.#offscreenCtx.measureText(text)
      const textBgW = actualBoundingBoxRight - actualBoundingBoxLeft
      const textBgH = actualBoundingBoxAscent - actualBoundingBoxDescent
      const fpxX = layout[0]
      const fpsY = layout[1] + actualBoundingBoxAscent
      this.#offscreenCtx.fillStyle = '#000'
      this.#offscreenCtx.fillRect(layout[0], layout[1], textBgW, textBgH)
      this.#offscreenCtx.fillStyle = '#3F3'
      this.#offscreenCtx.fillText(text, fpxX, fpsY)
    }

    const ctx = this.#ctx
    const { width: canvasWidth, height: canvasHeight } = ctx.canvas
    ctx.fillStyle = '#000'
    ctx.clearRect(0, 0, canvasWidth, canvasHeight)
    ctx.drawImage(this.#offscreen, 0, 0, this.#offscreen.width, this.#offscreen.height, 0, 0, canvasWidth, canvasHeight)

    this.#animationId = requestAnimationFrame(this.#draw)
  }

  destory = () => {
    this.#subscriptions.forEach((subscription) => {
      subscription.unsubscribe()
    })
    this.#videoFrameInfo?.frame.close()
    this.#videoFrameInfo = null
    this.#ctx.clearRect(0, 0, this.#ctx.canvas.width, this.#ctx.canvas.height)
    cancelAnimationFrame(this.#animationId)
  }
}
