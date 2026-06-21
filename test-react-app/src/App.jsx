import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

function App({ monitor }) {
  const [count, setCount] = useState(0)
  const [errorComponentVisible, setErrorComponentVisible] = useState(false)

  // 测试JavaScript运行时错误
  const testRuntimeError = () => {
    console.log('测试JavaScript运行时错误')
    try {
      const undefinedVar = null
      undefinedVar.someMethod() // 这会抛出运行时错误
    } catch (error) {
      console.log('测试错误已被捕获并上报:', error.message)
      monitor.reportError(error, { test: 'runtime-error' })
    }
  }

  // 测试Promise未处理错误
  const testPromiseError = () => {
    console.log('测试Promise未处理错误')
    const promise = new Promise((resolve, reject) => {
      setTimeout(() => {
        reject(new Error('Promise rejection error'))
      }, 100)
    })
    
    // 添加catch处理避免未捕获的Promise拒绝
    promise.catch(error => {
      console.log('测试Promise错误已被捕获并上报:', error.message)
      monitor.reportError(error, { test: 'promise-error' })
    })
  }

  // 测试网络请求监控
  const testNetworkRequest = () => {
    console.log('测试网络请求监控')
    // 测试XHR请求
    const xhr = new XMLHttpRequest()
    xhr.open('GET', 'https://jsonplaceholder.typicode.com/todos/1')
    xhr.send()

    // 测试Fetch请求
    fetch('https://jsonplaceholder.typicode.com/posts/1')
      .then(response => response.json())
      .then(data => console.log('Fetch response:', data))
  }

  // 测试用户行为追踪
  const testUserBehavior = () => {
    console.log('测试用户行为追踪')
    // 手动添加面包屑
    monitor.addBreadcrumb('custom', {
      message: '用户执行了自定义操作',
      data: { test: 'data' }
    })
  }

  // 测试控制台输出记录
  const testConsoleOutput = () => {
    console.log('测试控制台输出 - log')
    console.warn('测试控制台输出 - warn')
    console.error('测试控制台输出 - error')
  }

  // 测试组件错误
  const testComponentError = () => {
    console.log('测试组件错误')
    // 直接创建一个错误并上报，避免实际渲染错误组件导致应用崩溃
    try {
      throw new Error('Test component render error')
    } catch (error) {
      console.log('测试组件错误已被捕获并上报:', error.message)
      monitor.reportError(error, { 
        test: 'component-error',
        componentName: 'ErrorComponent'
      })
    }
  }

  // 手动上报错误
  const testManualErrorReport = () => {
    console.log('测试手动上报错误')
    monitor.reportError(new Error('手动上报的错误'), {
      context: 'test',
      customData: 'custom data'
    })
  }

  return (
    <div className="app">
      <div className="header">
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React + Yuan Monitor SDK</h1>
      <p>点击下方按钮测试监控SDK功能</p>

      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
      </div>

      <div className="test-buttons">
        <h3>错误监控测试</h3>
        <button onClick={testRuntimeError}>测试运行时错误</button>
        <button onClick={testPromiseError}>测试Promise错误</button>
        <button onClick={testComponentError}>测试组件错误</button>
        <button onClick={testManualErrorReport}>测试手动上报错误</button>

        <h3>性能与网络测试</h3>
        <button onClick={testNetworkRequest}>测试网络请求监控</button>

        <h3>用户行为测试</h3>
        <button onClick={testUserBehavior}>测试自定义行为追踪</button>
        <button onClick={testConsoleOutput}>测试控制台输出记录</button>
      </div>

      {/* 错误组件，用于测试组件渲染错误 */}
      {errorComponentVisible && <ErrorComponent shouldThrow={false} />}

      <p className="read-the-docs">
        查看浏览器控制台以查看监控SDK的调试信息
      </p>
    </div>
  )
}

// 错误组件
function ErrorComponent({ shouldThrow = true }) {
  if (shouldThrow) {
    // 这会导致渲染错误
    const undefinedVar = null
    undefinedVar.someProperty // 这会抛出渲染错误
  }
  return <div>This component would throw an error if enabled</div>
}

export default App
