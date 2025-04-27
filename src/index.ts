#!/usr/bin/env node

/**
 * Flux-Dev MCP服务器
 *
 * 这个MCP服务器提供与阿里云DashScope API交互的功能，用于生成图片并保存到本地。
 * 提供以下工具：
 * - generate_image: 提交图片生成任务
 * - check_task_status: 检查任务状态
 * - download_image: 下载生成的图片并保存到本地
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import fs from "fs";
import path from "path";
import os from "os";

// 配置
const API_KEY = process.env.DASHSCOPE_API_KEY || "example-key";
const SAVE_DIR =
  process.env.SAVE_DIR || path.join(os.homedir(), "Desktop", "flux-images");
const MODEL_NAME = process.env.MODEL_NAME || "flux-merged";

// 确保保存目录存在
if (!fs.existsSync(SAVE_DIR)) {
  fs.mkdirSync(SAVE_DIR, { recursive: true });
}

// 工具参数验证函数
const isValidGenerateImageArgs = (
  args: any
): args is { prompt: string; size?: string; seed?: number; steps?: number } => {
  return (
    typeof args === "object" &&
    args !== null &&
    typeof args.prompt === "string" &&
    (args.size === undefined || typeof args.size === "string") &&
    (args.seed === undefined || typeof args.seed === "number") &&
    (args.steps === undefined || typeof args.steps === "number")
  );
};

const isValidTaskIdArgs = (
  args: any
): args is { task_id: string; save_path?: string } => {
  return (
    typeof args === "object" &&
    args !== null &&
    typeof args.task_id === "string" &&
    (args.save_path === undefined || typeof args.save_path === "string")
  );
};

/**
 * 创建MCP服务器
 */
const server = new Server(
  {
    name: "flux-dev",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * 设置HTTP客户端
 */
const apiClient = axios.create({
  baseURL: "https://dashscope.aliyuncs.com/api/v1",
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
    "X-DashScope-Async": "enable",
  },
});

/**
 * 列出可用工具
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "generate_image",
        description: "使用阿里云DashScope API生成图片",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "图片生成提示词",
            },
            size: {
              type: "string",
              description:
                '图片尺寸，可选值: "1024*1024", "720*1280", "1280*720"',
              default: "1024*1024",
            },
            seed: {
              type: "number",
              description: "随机种子",
            },
            steps: {
              type: "number",
              description: "迭代步数",
            },
          },
          required: ["prompt"],
        },
      },
      {
        name: "check_task_status",
        description: "检查图片生成任务状态",
        inputSchema: {
          type: "object",
          properties: {
            task_id: {
              type: "string",
              description: "任务ID",
            },
          },
          required: ["task_id"],
        },
      },
      {
        name: "download_image",
        description: "下载生成的图片并保存到本地",
        inputSchema: {
          type: "object",
          properties: {
            task_id: {
              type: "string",
              description: "任务ID",
            },
            save_path: {
              type: "string",
              description: "自定义保存路径，如不提供则使用默认路径",
            },
          },
          required: ["task_id"],
        },
      },
    ],
  };
});

/**
 * 处理工具调用
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "generate_image":
      return generateImage(request.params.arguments);
    case "check_task_status":
      return checkTaskStatus(request.params.arguments);
    case "download_image":
      return downloadImage(request.params.arguments);
    default:
      throw new McpError(
        ErrorCode.MethodNotFound,
        `未知工具: ${request.params.name}`
      );
  }
});

/**
 * 生成图片
 */
async function generateImage(args: unknown) {
  if (!isValidGenerateImageArgs(args)) {
    throw new McpError(ErrorCode.InvalidParams, "无效的图片生成参数");
  }

  try {
    const response = await apiClient.post(
      "/services/aigc/text2image/image-synthesis",
      {
        model: MODEL_NAME,
        input: {
          prompt: args.prompt,
        },
        parameters: {
          size: args.size || "1024*1024",
          seed:
            args.seed !== undefined
              ? args.seed
              : Math.floor(Math.random() * 1000),
          steps: args.steps || 4,
        },
      }
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response.data, null, 2),
        },
      ],
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return {
        content: [
          {
            type: "text",
            text: `API请求错误: ${
              JSON.stringify(error.response?.data) || error.message
            }`,
          },
        ],
        isError: true,
      };
    }
    throw error;
  }
}

/**
 * 检查任务状态
 */
async function checkTaskStatus(args: unknown) {
  if (!isValidTaskIdArgs(args)) {
    throw new McpError(ErrorCode.InvalidParams, "无效的任务ID参数");
  }

  try {
    const response = await apiClient.get(`/tasks/${args.task_id}`);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response.data, null, 2),
        },
      ],
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return {
        content: [
          {
            type: "text",
            text: `API请求错误: ${
              JSON.stringify(error.response?.data) || error.message
            }`,
          },
        ],
        isError: true,
      };
    }
    throw error;
  }
}

/**
 * 下载图片并保存到本地
 */
async function downloadImage(args: unknown) {
  if (!isValidTaskIdArgs(args)) {
    throw new McpError(ErrorCode.InvalidParams, "无效的任务ID参数");
  }

  try {
    // 1. 首先检查任务状态
    const statusResponse = await apiClient.get(`/tasks/${args.task_id}`);

    const statusData = statusResponse.data;

    // 2. 检查任务是否成功完成
    if (statusData.output.task_status !== "SUCCEEDED") {
      return {
        content: [
          {
            type: "text",
            text: `任务尚未完成或已失败: ${JSON.stringify(
              statusData,
              null,
              2
            )}`,
          },
        ],
        isError: true,
      };
    }

    // 3. 获取图片URL
    const imageUrls = statusData.output.results.map(
      (result: any) => result.url
    );

    if (!imageUrls || imageUrls.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "没有找到图片URL",
          },
        ],
        isError: true,
      };
    }

    // 4. 下载所有图片
    const downloadResults = [];
    // 确定保存目录
    const customSavePath = (args as { task_id: string; save_path?: string })
      .save_path;
    const targetDir = customSavePath ? customSavePath : SAVE_DIR;

    // 确保目标目录存在
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    for (let i = 0; i < imageUrls.length; i++) {
      const url = imageUrls[i];
      const filename = `${args.task_id}_${i}.png`;
      const savePath = path.join(targetDir, filename);

      const imageResponse = await axios.get(url, {
        responseType: "arraybuffer",
      });

      await fs.promises.writeFile(savePath, Buffer.from(imageResponse.data));

      downloadResults.push({
        url: url,
        saved_to: savePath,
      });
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              message: "图片下载完成",
              task_id: args.task_id,
              downloads: downloadResults,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return {
        content: [
          {
            type: "text",
            text: `API请求错误: ${
              JSON.stringify(error.response?.data) || error.message
            }`,
          },
        ],
        isError: true,
      };
    }
    throw error;
  }
}

/**
 * 启动服务器
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Flux-Dev MCP服务器运行中...");
}

main().catch((error) => {
  console.error("服务器错误:", error);
  process.exit(1);
});
