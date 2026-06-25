import eventBus from '../core/eventBus';

/**
 * SourceMapParser - Source Map stack parser
 *
 * 1. Listen for error:captured events and extract file/line/column from stack traces.
 * 2. Load the corresponding source map file and map generated code back to original source.
 * 3. Attach the original stack to error payloads for easier debugging.
 */
class SourceMapParser {
  constructor(config) {
    this.config = config;
    this._cache = new Map();
    this._errorHandler = null;
    this._sourceMapConsumer = null;
  }

  init() {
    const smConfig = this.config.advanced.sourceMap || {};
    if (!smConfig.enable) return;

    this.options = {
      mapUrlTemplate: smConfig.mapUrlTemplate || '',
      serverParseUrl: smConfig.serverParseUrl || '',
      cache: smConfig.cache !== false,
      maxCacheSize: smConfig.maxCacheSize || 50,
      maxStackDepth: smConfig.maxStackDepth || 10
    };

    this._errorHandler = (errorData) => this._onErrorCaptured(errorData);
    eventBus.on('error:captured', this._errorHandler);

    this._loadSourceMapLib();

    eventBus.emit('advanced:sourceMap:initialized');
  }

  /**
   * 异步加载 source-map 库
   */
  async _loadSourceMapLib() {
    try {
      const module = await import('source-map');
      this._sourceMapConsumer = module.SourceMapConsumer || module.default?.SourceMapConsumer;

      if (this._sourceMapConsumer && this.config.debug) {
        console.log('[Monitor] source-map 库加载成功');
      }
    } catch (error) {
      if (this.config.debug) {
        console.warn('[Monitor] source-map 库加载失败，将使用服务端解析:', error.message);
      }
    }
  }

  _onErrorCaptured(errorData) {
    if (!errorData.stack) return;

    const stackFrames = this._parseStackFrames(errorData.stack);
    if (stackFrames.length === 0) return;

    if (this.options.serverParseUrl) {
      this._parseOnServer(stackFrames)
        .then((parsedFrames) => {
          if (parsedFrames.length > 0) {
            errorData.originalStack = parsedFrames;
            eventBus.emit('advanced:sourceMap:parsed', {
              originalStack: parsedFrames,
              errorData
            });
          }
        })
        .catch(() => {});
      return;
    }

    if (this._sourceMapConsumer) {
      this._parseOnClient(stackFrames)
        .then((parsedFrames) => {
          if (parsedFrames.length > 0) {
            errorData.originalStack = parsedFrames;
            eventBus.emit('advanced:sourceMap:parsed', {
              originalStack: parsedFrames,
              errorData
            });
          }
        })
        .catch(() => {});
    }
  }

  _parseStackFrames(stack) {
    const frames = [];
    const lines = stack.split('\n');
    const stackRegex = /^\s*at\s+(?:(.*?)\s+\()?(.*?):(\d+):(\d+)\)?$/;

    for (const line of lines) {
      const match = line.match(stackRegex);
      if (!match) continue;

      const [, functionName, filePath, lineNo, column] = match;
      if (filePath && !filePath.startsWith('chrome') && !filePath.includes('node_modules')) {
        frames.push({
          functionName: functionName || '<anonymous>',
          filePath,
          line: parseInt(lineNo, 10),
          column: parseInt(column, 10)
        });

        if (frames.length >= this.options.maxStackDepth) break;
      }
    }

    return frames;
  }

  async _parseOnClient(stackFrames) {
    const parsedFrames = [];

    for (const frame of stackFrames) {
      const sourceMapUrl = this._getSourceMapUrl(frame.filePath);
      if (!sourceMapUrl) continue;

      try {
        const consumer = await this._getSourceMapConsumer(sourceMapUrl);
        if (!consumer) continue;

        const originalPosition = consumer.originalPositionFor({
          line: frame.line,
          column: frame.column
        });

        if (originalPosition && originalPosition.source) {
          parsedFrames.push({
            functionName: originalPosition.name || frame.functionName,
            filePath: originalPosition.source,
            line: originalPosition.line,
            column: originalPosition.column,
            originalFilePath: frame.filePath,
            originalLine: frame.line,
            originalColumn: frame.column
          });
        }
      } catch (error) {
        if (this.config.debug) {
          console.warn('[Monitor] Source Map parse failed:', frame.filePath, error.message);
        }
      }
    }

    return parsedFrames;
  }

  async _parseOnServer(stackFrames) {
    try {
      const response = await fetch(this.options.serverParseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frames: stackFrames }),
        credentials: 'include'
      });

      if (response.ok) {
        const result = await response.json();
        return result.frames || [];
      }
    } catch (error) {
      if (this.config.debug) {
        console.warn('[Monitor] Server Source Map parse failed:', error.message);
      }
    }

    return [];
  }

  _getSourceMapUrl(filePath) {
    if (this.options.mapUrlTemplate) {
      return this.options.mapUrlTemplate.replace('{file}', filePath);
    }

    return filePath + '.map';
  }

  async _getSourceMapConsumer(sourceMapUrl) {
    if (this.options.cache && this._cache.has(sourceMapUrl)) {
      return this._cache.get(sourceMapUrl);
    }

    try {
      const response = await fetch(sourceMapUrl);
      if (!response.ok) return null;

      const rawSourceMap = await response.json();
      const consumer = await new this._sourceMapConsumer(rawSourceMap);

      if (this.options.cache) {
        if (this._cache.size >= this.options.maxCacheSize) {
          const firstKey = this._cache.keys().next().value;
          const oldConsumer = this._cache.get(firstKey);
          if (oldConsumer && typeof oldConsumer.destroy === 'function') {
            oldConsumer.destroy();
          }
          this._cache.delete(firstKey);
        }
        this._cache.set(sourceMapUrl, consumer);
      }

      return consumer;
    } catch (error) {
      if (this.config.debug) {
        console.warn('[Monitor] Source Map file fetch failed:', sourceMapUrl, error.message);
      }
      return null;
    }
  }

  async parseStack(stack) {
    const frames = this._parseStackFrames(stack);
    if (frames.length === 0) return [];

    if (this.options.serverParseUrl) {
      return this._parseOnServer(frames);
    }

    if (this._sourceMapConsumer) {
      return this._parseOnClient(frames);
    }

    return frames;
  }

  destroy() {
    if (this._errorHandler) {
      eventBus.off('error:captured', this._errorHandler);
      this._errorHandler = null;
    }

    for (const [, consumer] of this._cache) {
      if (consumer && typeof consumer.destroy === 'function') {
        consumer.destroy();
      }
    }
    this._cache.clear();

    this._sourceMapConsumer = null;

    eventBus.emit('advanced:sourceMap:destroyed');
  }
}

export default SourceMapParser;
