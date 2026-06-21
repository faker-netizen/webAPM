import eventBus from '../core/eventBus';

class ErrorCollector {
  constructor(config) {
    this.config = config;
    this.originalOnerror = null;
    this.originalOnunhandledrejection = null;
    this.resourceErrorHandler = null;
  }

  init() {
    if (!this.config.error.enable) return;

    this.setupGlobalErrorHandler();
    this.setupPromiseRejectionHandler();
    this.setupResourceErrorHandler();

    eventBus.emit('collector:error:initialized');
  }

  setupGlobalErrorHandler() {
    if (!this.config.error.captureGlobalErrors) return;

    this.originalOnerror = window.onerror;

    window.onerror = (message, source, lineno, colno, error) => {
      // 过滤掉资源错误，因为已经由resourceErrorHandler处理
      if (typeof message === 'string' && message.startsWith('Script error')) {
        return this.originalOnerror?.(message, source, lineno, colno, error);
      }

      this.handleError({
        type: 'js',
        message: message?.toString() || 'Unknown error',
        source,
        lineno,
        colno,
        stack: error?.stack,
        error
      });

      return this.originalOnerror?.(message, source, lineno, colno, error);
    };
  }

  setupPromiseRejectionHandler() {
    if (!this.config.error.capturePromiseRejections) return;

    this.originalOnunhandledrejection = window.onunhandledrejection;

    window.onunhandledrejection = (event) => {
      const reason = event.reason;

      this.handleError({
        type: 'promise',
        message: reason?.message || 'Unhandled promise rejection',
        stack: reason?.stack,
        reason,
        promise: event.promise
      });

      return this.originalOnunhandledrejection?.(event);
    };
  }

  setupResourceErrorHandler() {
    if (!this.config.error.captureResourceErrors) return;

    this.resourceErrorHandler = (event) => {
      const target = event.target;
      if (target && (target.tagName === 'SCRIPT' || target.tagName === 'LINK' || target.tagName === 'IMG')) {
        this.handleError({
          type: 'resource',
          tagName: target.tagName,
          url: target.src || target.href,
          outerHTML: target.outerHTML
        });
      }
    };

    window.addEventListener('error', this.resourceErrorHandler, true);
  }

  handleError(errorData) {
    const error = {
      ...errorData,
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      language: navigator.language
    };

    eventBus.emit('error:captured', error);
  }

  destroy() {
    // 恢复原始的错误处理函数
    if (this.originalOnerror) {
      window.onerror = this.originalOnerror;
    }

    if (this.originalOnunhandledrejection) {
      window.onunhandledrejection = this.originalOnunhandledrejection;
    }

    if (this.resourceErrorHandler) {
      window.removeEventListener('error', this.resourceErrorHandler, true);
    }

    eventBus.emit('collector:error:destroyed');
  }
}

export default ErrorCollector;