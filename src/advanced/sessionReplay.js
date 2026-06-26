import eventBus from '../core/eventBus';

let rrwebModule = null;
let rrwebLoadPromise = null;

async function loadRrweb() {
  if (rrwebModule) return rrwebModule;
  if (rrwebLoadPromise) return rrwebLoadPromise;

  rrwebLoadPromise = import('rrweb')
    .then((module) => {
      rrwebModule = module;
      return module;
    })
    .catch((error) => {
      console.warn('[Monitor] rrweb loading failed, session replay unavailable:', error.message);
      rrwebLoadPromise = null;
      return null;
    });

  return rrwebLoadPromise;
}

class SessionReplay {
  constructor(config) {
    this.config = config;
    this.stopFn = null;
    this.isRecording = false;

    this.segments = [];
    this.currentSegment = null;
    this.events = [];
    this.errorIndex = -1;

    this.pendingErrorCount = 0;
    this.lastErrorTime = 0;
    this.autoReportTimer = null;
    this.flushTimer = null;
    this._errorHandler = null;
    this._unloadHandler = null;
  }

  init() {
    if (!this.config.advanced.enableSessionReplay) return;

    if (Math.random() > this.config.advanced.sessionReplaySampleRate) {
      if (this.config.debug) {
        console.log('[Monitor] session replay sample miss, skip init');
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
      console.log('[Monitor] session replay initialized');
    }
  }

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
      console.warn('[Monitor] rrweb record function unavailable');
      return;
    }

    const maxDuration = this.config.advanced.maxReplayDuration || 60;
    const maxEvents = maxDuration * 15;
    const checkoutEveryNms = this.config.advanced.checkoutEveryNms || 5000;

    this.isRecording = true;
    this.segments = [];
    this.currentSegment = [];
    this.events = this.currentSegment;
    this.errorIndex = -1;

    try {
      this.stopFn = recordFn({
        checkoutEveryNms,
        emit: (event, isCheckout) => {
          this._handleRecordedEvent(event, isCheckout, maxEvents);
        },
        recordCanvas: false,
        maskAllInputs: true,
        blockSelector: '.monitor-block',
        ignoreClass: 'monitor-ignore',
        maskTextSelector: 'input, textarea, [data-monitor-mask]'
      });

      eventBus.emit('advanced:sessionReplay:started');

      if (this.config.debug) {
        console.log('[Monitor] rrweb recording started');
      }
    } catch (error) {
      console.warn('[Monitor] rrweb recording failed:', error.message);
      this.isRecording = false;
    }
  }

  _handleRecordedEvent(event, isCheckout, maxEvents) {
    const EventType = this._getEventType();
    const isFullSnapshot = EventType && event?.type === EventType.FullSnapshot;

    if (!this.currentSegment) {
      this.currentSegment = [];
      this.segments = [this.currentSegment];
      this.events = this.currentSegment;
    }

    if (isFullSnapshot && isCheckout && this.currentSegment.length > 0) {
      this.currentSegment = [event];
      this.segments.push(this.currentSegment);
      this.events = this.currentSegment;
      this.errorIndex = -1;
    } else {
      this.currentSegment.push(event);
    }

    if (this.currentSegment.length > maxEvents) {
      this.currentSegment.shift();
      if (this.errorIndex > 0) {
        this.errorIndex--;
      } else if (this.errorIndex === 0) {
        this.errorIndex = -1;
      }
    }

    while (this.segments.length > 2) {
      this.segments.shift();
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
    this.errorIndex =
      this.currentSegment && this.currentSegment.length > 0
        ? this.currentSegment.length
        : this.events.length;
    this.pendingErrorCount++;

    if (!this.isRecording) {
      this.startRecording();
    }

    this._resetAutoReportTimer();

    if (this.config.debug) {
      console.log(
        `[Monitor] session replay captured error at index ${this.errorIndex}, report after ${this.config.advanced.replayAfterError || 10}s`
      );
    }

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
    if (!this.config.serverUrl) return;

    const sourceEvents = this._getReplaySourceEvents();
    if (sourceEvents.length === 0) return;
    const eventType = this._getEventType();
    const hasRrwebTypedEvents =
      !!eventType && sourceEvents.some((event) => typeof event?.type === 'number');

    const beforeErrorSec = this.config.advanced.replayBeforeError || 30;
    const beforeErrorCount = beforeErrorSec * 10;

    let relevantEvents = [...sourceEvents];
    let errorOffset = -1;

    if (this.errorIndex >= 0 && this.errorIndex < sourceEvents.length) {
      const startIndex = Math.max(0, this.errorIndex - beforeErrorCount);
      relevantEvents = sourceEvents.slice(startIndex);
      errorOffset = this.errorIndex - startIndex;
    }

    if (hasRrwebTypedEvents) {
      const firstFullSnapshotIndex = relevantEvents.findIndex((event) =>
        this._isFullSnapshotEvent(event)
      );

      if (firstFullSnapshotIndex > 0) {
        relevantEvents = relevantEvents.slice(firstFullSnapshotIndex);
        if (errorOffset >= 0) {
          errorOffset = Math.max(0, errorOffset - firstFullSnapshotIndex);
        }
      }

      if (
        relevantEvents.length === 0 ||
        !relevantEvents.some((event) => this._isFullSnapshotEvent(event))
      ) {
        if (this.config.debug) {
          console.warn('[Monitor] replay segment has no FullSnapshot, skip report');
        }
        return;
      }
    }

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
        `[Monitor] session replay reported, eventCount=${relevantEvents.length}, duration=${data.duration}ms`
      );
    }
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
          console.warn('[Monitor] session replay report failed:', err.message);
        }
      });
    } catch (error) {
      if (this.config.debug) {
        console.warn('[Monitor] session replay serialization failed:', error.message);
      }
    }
  }

  _getEventType() {
    return rrwebModule?.EventType || rrwebModule?.default?.EventType || null;
  }

  _isFullSnapshotEvent(event) {
    const EventType = this._getEventType();
    return !!EventType && event?.type === EventType.FullSnapshot;
  }

  _getReplaySourceEvents() {
    if (this.currentSegment && this.currentSegment.length > 0) {
      return [...this.currentSegment];
    }

    const latestSegment = this.segments[this.segments.length - 1];
    if (latestSegment && latestSegment.length > 0) {
      return [...latestSegment];
    }

    return [...this.events];
  }

  getEvents() {
    return [...this._getReplaySourceEvents()];
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
    this.segments = [];
    this.currentSegment = null;
    this.errorIndex = -1;
    this.pendingErrorCount = 0;
    this.lastErrorTime = 0;

    eventBus.emit('advanced:sessionReplay:destroyed');
  }
}

export default SessionReplay;
