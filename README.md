# 编程互动课堂 · GitHub Pages 纯浏览器版

版本：v20261022.2。代码编辑区顶部显示“纯浏览器版”。

Python 由 Pyodide / CPython 执行，C 由 WebAssembly 版 Clang 22 实际编译并运行。
无代码运行服务器，无第三方 CDN。所有解释器、编译器、标准库和图片随网站提供。

## 发布到 GitHub Pages

1. 新建 GitHub 仓库，将本目录 **内部的全部内容** 上传到仓库根目录。根目录应直接有 `index.html`、`vendor/`、`engine-worker.js`、`.nojekyll` 等，而非再套一层文件夹。
2. 最简单：进入仓库 Settings → Pages，Source 选择 **Deploy from a branch**，分支 `main`，目录 `/(root)`，保存。
3. 也可选 GitHub Actions，使用随附的 `.github/workflows/pages.yml`。
4. 等待 Pages 发布完成，打开 Settings → Pages 中显示的 HTTPS 地址。
5. 首次打开可能自动刷新一次，以使站内 Service Worker 添加交互输入所需的隔离响应头。
6. 看到“纯浏览器版 · v20261022.2”后即可使用；首次运行 Python / C 时下载相应运行文件，后续由浏览器缓存。

支持 `用户名.github.io/仓库名/` 这样的子路径，不需要修改代码中的地址。
发布到 GitHub Pages 不需要 Python 启动脚本，不要上传 Windows 离线运行文件。

部署后可打开同目录 `runtime-check.html`，点击“开始验证”，自动核对两种语言的真实执行与两次输入。

## 浏览器和交互输入

建议使用较新的桌面版 Chrome 或 Edge，通过 HTTPS 打开。浏览器必须允许本站 Service Worker。
运行至 input() / scanf() 时，网页出现输入框，填写后回车继续。Python 及 C 的任务案例已显式包含输入语句。
如使用运行前的预填输入，按语言的标准输入语义读取；清空预填框即可恢复逐次交互输入。

主页面、Python / C 执行、头文件与变量声明检查、原生错误、输出条、变量与动画绑定、案例判分、单步回放、语言记忆及两个视觉面板的位置交换均保留。
浏览器版 C 使用 Clang，其诊断文字可能与 Windows 离线版 TinyCC 不同。
自由编程的范围是浏览器内支持的 Python 标准库及 WASI C 环境；不提供本机操作系统、任意 pip 包或本机设备访问。

## 技术说明

- 服务端只提供静态文件；代码运行在 Web Worker 内。
- `coi-serviceworker.js` 为同源响应添加 COOP / COEP，使 GitHub Pages 上的 SharedArrayBuffer 输入通道可用。
- SharedArrayBuffer 在运行线程等待输入时保持程序暂停；主页面仍可操作输入、停止按钮。
- 直接终止 Worker 可停止死循环；初始化或编译时也可停止，下一次运行会重建运行环境。
- C 原始代码先独立编译，通过后才注入观察代码，避免后台头文件掩盖缺少声明的问题。
- 草稿、语言和进度保存在当前浏览器；不同设备之间不会自动同步。
- 第一次加载全部运行文件约 40 MB（Python 与 C 按需加载），随后缓存；页面本身较小。
- GitHub Pages 的可达性受实际访问网络影响。本包已验证纯静态部署和仓库子路径运行，未宣称已完成中国大陆各网络实测。

## 依赖

- Pyodide 314.0.7 / CPython（vendor/pyodide）
- @live-codes/clang-wasm 0.3.0 / Clang 22.1.8（vendor/clang）
- 上游许可和第三方声明见 licenses/。
- 图片沿用原课堂课件素材。

## 更新

以后更新文件时沿用同一仓库；更新 `coi-serviceworker.js` 中的缓存版本，避免使用过期运行资源。
无需构建，GitHub Pages 可直接发布。不要删除 vendor 中的 .gz/.wasm/.zip 运行文件。
