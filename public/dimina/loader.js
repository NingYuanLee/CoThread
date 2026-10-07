// Dimina 运行时加载器。
//
// 为什么需要它：Vite 禁止从源码 import() `public/` 里的文件（会返回 500：
// "This file is in /public ... should not be imported from source code"）。
// 但运行时又必须留在 public/：生产构建靠它原样复制，而且容器内部用
// `new URL("./service.js", import.meta.url)` 推导 worker 路径，所以它必须与
// service.js / pageFrame.* 同目录。
//
// 这个文件由前端以 <script type="module" src="/dimina/loader.js"> 的形式加载
// （参照 URL 而不是源码导入），所以不经过 Vite 的模块图，问题消失。
import * as runtime from "./index.js";

const url = new URL("./index.js", import.meta.url).href;
globalThis.__COTHREAD_DIMINA__ = { url, module: runtime };
