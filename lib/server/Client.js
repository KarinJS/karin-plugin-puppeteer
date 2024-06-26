import WebSocket from 'ws'
import { logger, puppeteer } from '#karin'
import VueCache from './VueFileCache.js'
import { Config } from '#karin'

export const store = new Map()
export default class WebSocketClient {
  constructor (url, headerId) {
    this.url = url
    this.headerId = headerId
    this.ws = null
    this.statr = false
    this.vueCache = VueCache
  }

  /** 创建 WebSocket 连接 */
  createWebSocket () {
    this.ws = new WebSocket(this.url, {
      headers: {
        'renderer-id': this.headerId,
        'renderer-type': 'image'
      }
    })

    this.ws.on('open', () => {
      this.statr = true
      logger.mark('[反向WS][连接成功]', this.url)

      /** 每5秒发一次心跳 中断就重连 */
      this.timer = setInterval(() => {
        try {
          this.ws.send(JSON.stringify({ action: 'heartbeat', data: { status: 'ok' } }))
        } catch (e) {
          logger.error('[反向WS]心跳异常：', this.url)
          logger.error(e)
          /** 关闭连接 */
          this.ws.close()
          clearInterval(this.timer)
        }
      }, 5000)
    })

    /** 反向ws暂时只考虑渲染本地文件或http */
    this.ws.on('message', async message => {
      message = JSON.parse(message)
      logger.debug(`[反向WS][渲染] URL: ${this.url} html:${message.data.file}`)
      const action = 'renderRes'
      const { echo, data } = message
      let res
      if (data.vue && Config.Config.server.http) {
        const cacheId = this.vueCache.addCache(data.file, data.name, data.props)
        res = await puppeteer.screenshot({...data, ...{file: `http://localhost:${Config.Config.http.port}/vue/${data.vueTemplate || 'default'}/?id=${cacheId}`}})
        this.vueCache.deleteCache(cacheId)
      } else {
        res = await puppeteer.screenshot(data)
      }
      res.echo = echo
      res.action = action
      return this.ws.send(JSON.stringify(res))
    })

    /** 连接断开 */
    this.ws.on('close', () => {
      this.statr = false
      logger.error('[反向WS][连接错误]：', this.url)
      try { clearInterval(this.timer) } catch { }
      this.reconnect()
    })

    /** 连接错误 */
    this.ws.on('error', error => {
      logger.debug(error)
    })
  }

  /** 重连函数 */
  reconnect () {
    setTimeout(this.createWebSocket.bind(this), 5000)
  }
}
