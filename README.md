# Web APM

前端应用监控SDK，支持 React 和 Vue 框架。提供错误监控、性能分析、用户行为追踪和录屏回放功能。

## 功能特性

### 错误监控
- JavaScript 运行时错误捕获
- Promise 拒绝处理
- 资源加载错误检测
- Vue 组件错误钩子
- React ErrorBoundary 集成
- Source Map 堆栈跟踪支持

### 性能监控
- Web Vitals 指标 (CLS, FCP, FID, LCP, TTFB)
- 资源加载性能分析
- 长任务检测
- 内存使用跟踪
- 自定义性能指标

### 用户行为分析
- 点击事件追踪
- 路由变化监控
- 网络请求拦截 (XHR/Fetch)
- 控制台日志记录
- 面包屑轨迹

### 录屏回放
- 使用 rrweb 进行页面交互录制
- 用户操作回放
- 输入框隐私脱敏
- 错误关联的录制会话

### 数据上报
- 多种传输方式 (Fetch, Beacon, Image)
- 批量上报，可配置间隔
- 自动重试，指数退避
- 采样率控制
- 调试模式

## 安装

```bash
npm install @lxl/webapm
```

## 快速开始

### React

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { init } from '@lxl/webapm';

const monitor = init({
  appKey: 'your-app-key',
  serverUrl: 'https://your-server.com/api/report',
  framework: {
    react: true
  },
  advanced: {
    enableSessionReplay: true,
    sessionReplaySampleRate: 1
  }
});

const { ErrorBoundary } = monitor;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
```

### Vue

```javascript
import Vue from 'vue';
import App from './App.vue';
import { init } from '@lxl/webapm';

const monitor = init({
  appKey: 'your-app-key',
  serverUrl: 'https://your-server.com/api/report',
  framework: {
    vue: true
  }
});

Vue.use(monitor);

new Vue({
  render: h => h(App)
}).$mount('#app');
```

## 配置选项

```javascript
const config = {
  appKey: 'your-app-key',
  serverUrl: 'https://your-server.com/api/report',
  sampleRate: 1,
  debug: true,

  error: {
    enable: true,
    captureGlobalErrors: true,
    capturePromiseRejections: true,
    captureResourceErrors: true
  },

  performance: {
    enable: true,
    captureWebVitals: true,
    captureResourceTiming: true,
    captureLongTasks: true,
    captureMemory: true
  },

  behavior: {
    enable: true,
    captureClicks: true,
    captureRouteChanges: true,
    captureNetworkRequests: true,
    captureConsole: false,
    maxBreadcrumbs: 20
  },

  advanced: {
    enableSessionReplay: true,
    sessionReplaySampleRate: 1,
    blockSelector: '.monitor-block',
    ignoreClass: 'monitor-ignore'
  },

  reporter: {
    batchSize: 5,
    batchInterval: 5000,
    maxQueueSize: 20,
    reportMethod: 'fetch',
    retryCount: 3,
    retryDelay: 1000
  },

  framework: {
    vue: false,
    react: false
  }
};
```

## API

### 初始化
```javascript
import { init } from '@lxl/webapm';

const monitor = init(config);
```

### 用户管理
```javascript
monitor.setUserId('user123');
monitor.setUserData({
  name: '张三',
  email: 'zhangsan@example.com'
});
```

### 手动上报
```javascript
monitor.reportError(new Error('自定义错误'), {
  page: 'home',
  component: 'Button'
});

monitor.reportPerformance({
  type: 'custom',
  name: 'api-response-time',
  value: 120
});

monitor.addBreadcrumb('custom', {
  message: '用户执行了操作'
});
```

### 控制方法
```javascript
const config = monitor.getConfig();
monitor.setConfig({ debug: true });
const sessionId = monitor.getSessionId();
const breadcrumbs = monitor.getBreadcrumbs();
monitor.clearBreadcrumbs();
monitor.flush();
monitor.destroy();
```

## 本地开发测试

本项目包含一个完整的测试 Demo，用于验证 SDK 的各项功能。

### 启动测试环境

需要打开 **3 个终端**，分别执行以下命令：

**终端 1 - 构建 SDK**
```bash
    npm run build
```

**终端 2 - 启动后端服务器 (端口 3001)**
```bash
    node test-server.js
```

**终端 3 - 启动前端测试应用 (端口 5175)**
```bash
    npm run dev
```

### 测试页面

打开浏览器访问：**http://localhost:5175**

测试页面包含以下功能区域：

#### 错误测试区
- **触发 JS 错误** - 模拟运行时 JavaScript 错误
- **触发 Promise 拒绝** - 模拟未处理的 Promise 拒绝
- **触发异步错误** - 模拟异步操作中的错误

#### 性能测试区
- **长任务测试** - 模拟超过 50ms 的长任务
- **内存压力测试** - 模拟内存使用

#### Session Replay 区
- **开始录屏** - 开始录制用户操作
- **停止并上报** - 停止录制并上报数据

#### 其他测试区
- **路由切换测试** - 模拟路由变化
- **网络请求测试** - 模拟 XHR/Fetch 请求
- **控制台输出** - 测试控制台日志捕获

### 查看上报数据

后端服务器提供以下 API 端点：

| 方法 | 端点 | 描述 |
|------|------|------|
| POST | `/api/report` | 接收错误和性能数据 |
| POST | `/api/session-replay` | 接收录屏数据 |
| GET | `/api/data` | 获取所有接收的数据 |
| DELETE | `/api/clear` | 清空所有数据 |

访问 **http://localhost:3001/api/data** 可以查看所有上报的数据：

```json
{
  "errors": [...],
  "performance": [...],
  "behavior": [...],
  "sessionReplay": [...]
}
```

### 测试流程

1. 启动上述 3 个终端服务
2. 打开 **http://localhost:5175**
3. 点击页面上的测试按钮触发各种错误
4. 观察终端 2 的输出，查看实时接收的数据
5. 访问 **http://localhost:3001/api/data** 查看完整数据

## 隐私保护

```javascript
const config = {
  advanced: {
    enableSessionReplay: true,
    maskAllInputs: true,
    blockSelector: '.private-info, [data-private]',
    ignoreClass: 'no-monitor',
    maskTextSelector: 'input[type="password"]'
  }
};
```

```html
<div class="private-info">敏感数据</div>
<button class="no-monitor">忽略此按钮</button>
<input type="password" data-monitor-mask />
```

## 浏览器支持

- Chrome (推荐)
- Firefox
- Safari
- Edge
- IE 11 (有限支持)

## 项目结构

```
src/
├── core/              # 核心功能
│   ├── index.js       # 主入口
│   ├── eventBus.js    # 事件通信
│   └── sessionManager.js
├── collector/         # 数据采集器
│   ├── errorCollector.js
│   ├── performanceCollector.js
│   └── behaviorCollector.js
├── advanced/          # 高级功能
│   └── sessionReplay.js
├── reporter/          # 数据上报
│   └── dataReporter.js
├── framework/         # 框架集成
│   ├── reactIntegration.js
│   └── vueIntegration.js
└── utils/             # 工具函数
    └── helpers.js
```

## 隐私声明

- SDK 不会收集用户的敏感个人信息
- 录屏功能默认对密码输入框进行脱敏处理
- 用户可通过配置选择性地排除特定元素
- 所有数据通过 HTTPS 安全传输

## License

MIT
