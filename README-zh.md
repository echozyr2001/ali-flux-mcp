# Ali-Flux MCP 服务器

一个用于阿里云 DashScope API 的模型上下文协议服务器

这是一个基于 TypeScript 的 MCP 服务器，提供与阿里云 DashScope API 交互的功能，用于生成图片并保存到本地。它通过以下方式展示了 MCP 的核心概念：

- 使用阿里云 DashScope API 生成图片的工具
- 检查任务状态的工具
- 下载生成的图片并保存到本地的工具

## 功能特性

### 工具
- `generate_image` - 使用阿里云 DashScope API 生成图片
  - 需要提供 prompt 参数
  - 可选参数：size, seed, steps
  - 向 DashScope API 提交图片生成任务

- `check_task_status` - 检查图片生成任务状态
  - 需要提供 task_id 参数
  - 返回图片生成任务的当前状态

- `download_image` - 下载生成的图片并保存到本地
  - 需要提供 task_id 参数
  - 可选参数：save_path 用于自定义保存位置
  - 下载所有生成的图片并保存到指定目录

## 开发

### 前提条件
- Node.js 和 npm
- 阿里云 DashScope API 密钥

### 环境变量
- `DASHSCOPE_API_KEY`：您的阿里云 DashScope API 密钥
- `SAVE_DIR`：保存生成图片的目录（默认：~/Desktop/flux-images）
- `MODEL_NAME`：DashScope 模型名称（默认：flux-merged）

### 设置
安装依赖：
```bash
npm install
```

构建服务器：
```bash
npm run build
```

用于开发的自动重新构建：
```bash
npm run watch
```

## 安装

### 配置
要与 Claude Desktop 或其他 MCP 兼容客户端一起使用，请添加服务器配置：

在 MacOS 上：`~/Library/Application Support/Claude/claude_desktop_config.json`
在 Windows 上：`%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ali-flux": {
      "command": "/path/to/ali-flux/build/index.js",
      "env": {
        "DASHSCOPE_API_KEY": "your-api-key-here",
        "SAVE_DIR": "/custom/save/path" // 可选
      }
    }
  }
}
```

### 调试

由于 MCP 服务器通过标准输入输出进行通信，调试可能具有挑战性。我们推荐使用 [MCP Inspector](https://github.com/modelcontextprotocol/inspector)，可通过以下包脚本使用：

```bash
npm run inspector
```

Inspector 将提供一个 URL，用于在浏览器中访问调试工具。
