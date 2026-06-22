# Web APM

Front-end monitoring SDK for React and Vue applications.

[GitHub](https://github.com/faker-netizen/webAPM)

## Features

- Error tracking: JavaScript runtime errors, Promise rejections, resource loading errors
- Performance monitoring: Web Vitals, resource timing, long tasks, memory usage
- Behavior analytics: clicks, route changes, network requests, console breadcrumbs
- Session replay: rrweb-based recording with privacy masking
- Advanced diagnostics: white screen detection and source map parsing
- Flexible reporting: fetch, beacon, and image-based transport

## Install

```bash
npm install @lxl_fe/webapm
```

## Quick Start

### React

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { init } from '@lxl_fe/webapm';

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

monitor.setReact(React);

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
import { init } from '@lxl_fe/webapm';

const monitor = init({
  appKey: 'your-app-key',
  serverUrl: 'https://your-server.com/api/report',
  framework: {
    vue: true
  }
});

monitor.useVue(Vue);

new Vue({
  render: h => h(App)
}).$mount('#app');
```

## Configuration

```javascript
const monitor = init({
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
    enableWhiteScreenDetection: false,
    sourceMap: {
      enable: false
    }
  }
});
```

## API

```javascript
monitor.setUserId('user123');
monitor.setUserData({
  name: 'Alice',
  email: 'alice@example.com'
});

monitor.reportError(new Error('Custom error'), {
  page: 'home'
});

monitor.reportPerformance({
  type: 'custom',
  name: 'api-response-time',
  value: 120
});

monitor.addBreadcrumb('custom', {
  message: 'User performed a custom action'
});

monitor.flush();
monitor.destroy();
```

## Repository

- GitHub: https://github.com/faker-netizen/webAPM
- Issues: https://github.com/faker-netizen/webAPM/issues

## License

MIT
