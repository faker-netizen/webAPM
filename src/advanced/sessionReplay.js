import eventBus from '../core/eventBus';
import { record as rrwebRecord } from 'rrweb';

/**
 * SessionReplay - �Ự¼���ط�ģ�飨�� Sentry ʵ�֣�
 */
class SessionReplay {
  constructor(config) {
    this.config = config;
    this.stopFn = null;
    this.isRecording = false;
    this.events = [];
    this.errorIndex = -1;
    this.pendingErrorCount = 0;
    this.lastErrorTime = 0;
    this.autoReportTimer = null;
    this.flushTimer = null;
    this._errorHandler = null;
  }

  init() {
    if (!this.config.advanced.enableSessionReplay) return;

    if (Math.random() > this.config.advanced.sessionReplaySampleRate) {
      if (this.config.debug) {
        console.log('[Monitor] ¼������δ���У�����¼����ʼ��');
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
  }

  startRecording() {
    if (this.isRecording) return;
    this._doStartRecording();
  }

  _doStartRecording() {
    if (this.isRecording) return;

    if (typeof rrwebRecord !== 'function') {
      console.warn('[Monitor] rrweb record ����������');
      return;
    }

    const maxDuration = this.config.advanced.maxReplayDuration || 60;
    const maxEvents = maxDuration * 15;

    this.isRecording = true;
    this.events = [];

    try {
      this.stopFn = rrwebRecord({
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
    } catch (error) {
      console.warn('[Monitor] rrweb ¼������ʧ��:', error.message);
      this.isRecording = false;
    }
  }

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

  _onErrorCaptured(errorData) {
    this.lastErrorTime = Date.now();
    this.errorIndex = this.events.length;
    this.pendingErrorCount++;

    if (!this.isRecording) {
      this.startRecording();
    }

    this._resetAutoReportTimer();
    eventBus.emit('advanced:sessionReplay:errorCaptured', {
      errorTime: this.lastErrorTime,
      errorIndex: this.errorIndex,
      errorData
    });
  }

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

  _onPageUnload() {
    if (document.visibilityState === 'hidden' && this.pendingErrorCount > 0) {
      this._reportSessionReplay();
    }
  }

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
      duration: relevantEvents.length > 1
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
  }

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
        const success = navigator.sendBeacon(`${this.config.serverUrl}/api/session-replay`, blob);
        if (success) return;
      }
      fetch(`${this.config.serverUrl}/api/session-replay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: serializedData,
        credentials: 'include',
        keepalive: true
      }).catch(err => {
        if (this.config.debug) {
          console.warn('[Monitor] ¼�������ϱ�ʧ��:', err.message);
        }
      });
    } catch (error) {
      if (this.config.debug) {
        console.warn('[Monitor] ¼���������л�ʧ��:', error.message);
      }
    }
  }

  getEvents() {
    return [...this.events];
  }

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
