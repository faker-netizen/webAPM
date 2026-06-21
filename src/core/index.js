import config from './config';
import eventBus from './eventBus';

class MonitorCore {
  constructor(options = {}) {
    this.config = { ...config, ...options };
    this.eventBus = eventBus;
    this.isInitialized = false;
    this.sessionId = this.generateSessionId();
    this.userId = null;
    this.userData = {};
  }
  
  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
  
  init() {
    if (this.isInitialized) return;
    
    // 初始化时采样
    if (Math.random() > this.config.sampleRate) {
      this.config.enable = false;
      return;
    }
    
    this.isInitialized = true;
    this.eventBus.emit('core:initialized', this.config);
    
    if (this.config.debug) {
      console.log('Monitor SDK initialized with config:', this.config);
    }
  }
  
  setConfig(options) {
    this.config = { ...this.config, ...options };
    this.eventBus.emit('core:configUpdated', this.config);
  }
  
  setUserId(userId) {
    this.userId = userId;
    this.userData.id = userId;
    this.eventBus.emit('core:userIdSet', userId);
  }
  
  setUserData(data) {
    this.userData = { ...this.userData, ...data };
    this.eventBus.emit('core:userDataSet', this.userData);
  }
  
  getSessionId() {
    return this.sessionId;
  }
  
  getConfig() {
    return this.config;
  }
  
  destroy() {
    this.eventBus.clear();
    this.isInitialized = false;
    if (this.config.debug) {
      console.log('Monitor SDK destroyed');
    }
  }
}

export default MonitorCore;