import eventBus from '../core/eventBus';

let rrwebModule = null;
let rrwebLoadPromise = null;

/**
 * 异步加载 rrweb 模块
 */
async function loadRrweb() {
  if (rrwebModule) return rrwebModule;
  if (rrwebLoadPromise) return rrwebLoadPromise;

  rrwebLoadPromise = import('rrweb')
    .then((module) => {
      rrwebModule = module;
      return module;
    })
    .catch((error) => {
      console.warn('[Monitor] rrweb 加载失败，录屏功能不可用:', error.message);
      rrwebLoadPromise = null;
      return null;
    });

  return rrwebLoadPromise;
}

/**
 * SessionReplay - 会话录屏回放模块（仿 Sentry 实现）
 *
 * 核心策略：始终后台录制 + 环形缓冲区
 * 1. 初始化时立即开启 rrweb 录制，不等待错误触发
 * 2. 使用环形缓冲区始终保留最近 N 秒的录屏数据
 * 3. 错误发生时：
 *    - 标记错误在事件流中的位置
 *    - 继续录制 replayAfterError 秒（默认 10 秒）
 *    - 截取「错误前 replayBeforeError 秒 + 错误后 N 秒」的完整片段上报
 * 4. 上报后继续后台录制，保持环形缓冲区运转
 */
class SessionReplay {
  constructor(config) {
    this.config = config;
    this.stopFn = null; // rrweb record() 返回的停止函数
    this.isRecording = false;
    this.events = []; // 环形缓冲区
    this.errorIndex = -1; // 错误在缓冲区中的位置
    this.pendingErrorCount = 0; // 待上报的错误计数
    this.lastErrorTime = 0; // 最近一次错误时间戳
    this.autoReportTimer = null; // 错误后延迟上报的定时器
    this.flushTimer = null; // 定期 flush 的定时器
    this._errorHandler = null; // 保存事件监听器引用，用于销毁时移除
  }

  init() {
    if (!this.config.advanced.enableSessionReplay) return;

    if (Math.random() > this.config.advanced.sessionReplaySampleRate) {
      if (this.config.debug) {
        console.log('[Monitor] 录屏采样未命中，跳过录屏初始化');
      }
      return;
    }

    this._errorHandler = (errorData) => this._onErrorCaptured(errorData);
    eventBus.on('error:captured', this._errorHandler);

    this.startRecording();

    const flushInterval = (this.config.advanced.maxReplayDuration || 60) * 1000;
    this.flushTimer = setInterval(() => {
      if (this.pendingErrorCount > 0 && this.lastErrorTime > 0) {
        this._reportSessionReplay();
      }
    }, flushInterval);

    this._unloadHandler = () => this._onPageUnload();
    window.addEventListener('visibilitychange', this._unloadHandler);
    window.addEventListener('pagehide', this._unloadHandler);

    eventBus.emit('advanced:sessionReplay:initialized');

    if (this.config.debug) {
      console.log('[Monitor] 录屏模块已初始化，后台持续录制中');
    }
  }

  /**
   * 开启 rrweb 录制
   */
  startRecording() {
    if (this.isRecording) return;

    if (!rrwebModule) {
      loadRrweb().then((module) => {
        if (module) {
          this._doStartRecording();
        }
      });
      return;
    }

    this._doStartRecording();
  }

  _doStartRecording() {
    if (this.isRecording) return;

    const recordFn = rrwebModule.record || rrwebModule.default?.record;
    if (typeof recordFn !== 'function') {
      console.warn('[Monitor] rrweb record 函数不可用');
      return;
    }

    const maxDuration = this.config.advanced.maxReplayDuration || 60;
    const maxEvents = maxDuration * 15;

    this.isRecording = true;
    this.events = [];

    try {
      this.stopFn = recordFn({
        emit: (event) => {
          this.events.push(event);

          if (this.events.length > maxEvents) {
            this.events.shift();
            if (this.errorIndex > 0) {
              this.errorIndex--;
            } else if (this.errorIndex === 0) {
              this.errorIndex = -1;
            }
          }
        },
        recordCanvas: false,
        maskAllInputs: true,
        blockSelector: '.monitor-block',
        ignoreClass: 'monitor-ignore',
        maskTextSelector: 'input, textarea, [data-monitor-mask]'
      });

      eventBus.emit('advanced:sessionReplay:started');

      if (this.config.debug) {
        console.log('[Monitor] rrweb 录制已启动');
      }
    } catch (error) {
      console.warn('[Monitor] rrweb 录制启动失败:', error.message);
      this.isRecording = false;
    }
  }

  /**
   * 停止录制
   */
  stopRecording() {
    if (!this.isRecording) return;

    if (typeof this.stopFn === 'function') {
      this.stopFn();
    }
    this.stopFn = null;
    this.isRecording = false;

    this._clearAutoReportTimer();

    eventBus.emit('advanced:sessionReplay:stopped');
  }

  /**
   * 错误捕获回调
   */
  _onErrorCaptured(errorData) {
    this.lastErrorTime = Date.now();
    this.errorIndex = this.events.length;
    this.pendingErrorCount++;

    if (!this.isRecording) {
      this.startRecording();
    }

    this._resetAutoReportTimer();

    if (this.config.debug) {
      console.log(
        `[Monitor] 录屏：捕获到错误，标记位置=${this.errorIndex}，${this.config.advanced.replayAfterError || 10}秒后上报`
      );
    }

    eventBus.emit('advanced:sessionReplay:errorCaptured', {
      errorTime: this.lastErrorTime,
      errorIndex: this.errorIndex,
      errorData
    });
  }

  /**
   * 重置自动上报计时器
   */
  _resetAutoReportTimer() {
    this._clearAutoReportTimer();

    const afterErrorMs = (this.config.advanced.replayAfterError || 10) * 1000;

    this.autoReportTimer = setTimeout(() => {
      this._reportSessionReplay();
    }, afterErrorMs);
  }

  _clearAutoReportTimer() {
    if (this.autoReportTimer) {
      clearTimeout(this.autoReportTimer);
      this.autoReportTimer = null;
    }
  }

  /**
   * 页面卸载时上报
   */
  _onPageUnload() {
    if (document.visibilityState === 'hidden' && this.pendingErrorCount > 0) {
      this._reportSessionReplay();
    }
  }

  /**
   * 上报录屏数据
   */
  _reportSessionReplay() {
    if (this.events.length === 0 || !this.config.serverUrl) return;

    const beforeErrorSec = this.config.advanced.replayBeforeError || 30;
    let relevantEvents;
    let errorOffset = -1;

    if (this.errorIndex >= 0 && this.errorIndex < this.events.length) {
      const beforeErrorCount = beforeErrorSec * 10;
      const startIndex = Math.max(0, this.errorIndex - beforeErrorCount);

      relevantEvents = this.events.slice(startIndex);
      errorOffset = this.errorIndex - startIndex;
    } else {
      relevantEvents = [...this.events];
    }

    if (this.lastErrorTime > 0 && beforeErrorSec > 0) {
      const cutoffTime = this.lastErrorTime - beforeErrorSec * 1000;
      const filtered = [];
      let newErrorOffset = -1;

      for (let i = 0; i < relevantEvents.length; i++) {
        if (relevantEvents[i].timestamp >= cutoffTime) {
          if (newErrorOffset === -1 && i >= errorOffset) {
            newErrorOffset = filtered.length;
          }
          filtered.push(relevantEvents[i]);
        }
      }

      relevantEvents = filtered;
      errorOffset = newErrorOffset >= 0 ? newErrorOffset : errorOffset;
    }

    if (relevantEvents.length === 0) return;

    const data = {
      type: 'session-replay',
      timestamp: Date.now(),
      lastErrorTime: this.lastErrorTime,
      errorCount: this.pendingErrorCount,
      errorOffset,
      events: relevantEvents,
      duration:
        relevantEvents.length > 1
          ? relevantEvents[relevantEvents.length - 1].timestamp - relevantEvents[0].timestamp
          : 0
    };

    this._sendReport(data);

    this.pendingErrorCount = 0;
    this.errorIndex = -1;

    eventBus.emit('advanced:sessionReplay:reported', {
      eventCount: relevantEvents.length,
      errorOffset,
      duration: data.duration
    });

    if (this.config.debug) {
      console.log(
        `[Monitor] 录屏数据已上报，事件数=${relevantEvents.length}，时长=${data.duration}ms`
      );
    }
  }

  /**
   * 发送上报数据
   */
  _sendReport(data) {
    const sessionId = eventBus.emit('core:getSessionId') || '';
    const userId = eventBus.emit('core:getUserId') || '';

    const reportData = {
      appKey: this.config.appKey,
      sessionId,
      userId,
      data,
      timestamp: Date.now()
    };

    if (!this.config.serverUrl) return;

    try {
      const serializedData = JSON.stringify(reportData);

      if (navigator.sendBeacon) {
        const blob = new Blob([serializedData], { type: 'application/json' });
        const success = navigator.sendBeacon(
          `${this.config.serverUrl}/api/session-replay`,
          blob
        );
        if (success) return;
      }

      fetch(`${this.config.serverUrl}/api/session-replay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: serializedData,
        credentials: 'include',
        keepalive: true
      }).catch((err) => {
        if (this.config.debug) {
          console.warn('[Monitor] 录屏数据上报失败:', err.message);
        }
      });
    } catch (error) {
      if (this.config.debug) {
        console.warn('[Monitor] 录屏数据序列化失败:', error.message);
      }
    }
  }

  /**
   * 获取当前缓冲区中的事件（调试用）
   */
  getEvents() {
    return [...this.events];
  }

  /**
   * 销毁模块，清理所有资源
   */
  destroy() {
    if (this.pendingErrorCount > 0) {
      this._reportSessionReplay();
    }

    this.stopRecording();

    if (this._errorHandler) {
      eventBus.off('error:captured', this._errorHandler);
      this._errorHandler = null;
    }

    this._clearAutoReportTimer();
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    if (this._unloadHandler) {
      window.removeEventListener('visibilitychange', this._unloadHandler);
      window.removeEventListener('pagehide', this._unloadHandler);
      this._unloadHandler = null;
    }

    this.events = [];
    this.errorIndex = -1;
    this.pendingErrorCount = 0;
    this.lastErrorTime = 0;

    eventBus.emit('advanced:sessionReplay:destroyed');
  }
}

export default SessionReplay;
