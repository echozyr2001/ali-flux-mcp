#!/usr/bin/env node

/**
 * Ali-Flux MCP Server
 *
 * This MCP server provides functionality to interact with Alibaba Cloud DashScope API for generating images and saving them locally.
 * Provides the following tools:
 * - generate_image: Submit image generation task
 * - check_task_status: Check task status
 * - download_image: Download generated images and save them locally
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

// Configuration
const API_KEY = process.env.DASHSCOPE_API_KEY || "example-key";
const SAVE_DIR =
  process.env.SAVE_DIR || path.join(os.homedir(), "Desktop", "flux-images");
const MODEL_NAME = process.env.MODEL_NAME || "flux-merged";
// Working directory for resolving relative paths
const WORK_DIR = process.env.WORK_DIR || process.cwd();

// Ensure save directory exists
if (!fs.existsSync(SAVE_DIR)) {
  fs.mkdirSync(SAVE_DIR, { recursive: true });
}

// Tool argument validation functions
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
): args is { task_id: string; save_path?: string; base_dir?: string } => {
  return (
    typeof args === "object" &&
    args !== null &&
    typeof args.task_id === "string" &&
    (args.save_path === undefined ||
      (typeof args.save_path === "string" &&
        (path.isAbsolute(args.save_path) || args.save_path === ""))) &&
    (args.base_dir === undefined || typeof args.base_dir === "string")
  );
};

/**
 * Create MCP server
 */
const server = new Server(
  {
    name: "ali-flux",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Set up HTTP client
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
 * List available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "generate_image",
        description: "Generate images using Alibaba Cloud DashScope API",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "Image generation prompt",
            },
            size: {
              type: "string",
              description:
                'Image size, available options: "1024*1024", "720*1280", "1280*720"',
              default: "1024*1024",
            },
            seed: {
              type: "number",
              description: "Random seed",
            },
            steps: {
              type: "number",
              description: "Iteration steps",
            },
          },
          required: ["prompt"],
        },
      },
      {
        name: "check_task_status",
        description: "Check image generation task status",
        inputSchema: {
          type: "object",
          properties: {
            task_id: {
              type: "string",
              description: "Task ID",
            },
          },
          required: ["task_id"],
        },
      },
      {
        name: "download_image",
        description: "Download generated images and save them locally",
        inputSchema: {
          type: "object",
          properties: {
            task_id: {
              type: "string",
              description: "Task ID",
            },
            save_path: {
              type: "string",
              description:
                "Absolute path where to save the file (e.g. /Users/username/Downloads/image.jpg). Must be an absolute path.",
            },
            base_dir: {
              type: "string",
              description:
                "Base directory for resolving relative paths. Defaults to WORK_DIR environment variable or current working directory",
            },
          },
          required: ["task_id"],
        },
      },
    ],
  };
});

/**
 * Handle tool calls
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
        `Unknown tool: ${request.params.name}`
      );
  }
});

/**
 * Generate image
 */
async function generateImage(args: unknown) {
  if (!isValidGenerateImageArgs(args)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "Invalid image generation parameters"
    );
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
            text: `API request error: ${
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
 * Check task status
 */
async function checkTaskStatus(args: unknown) {
  if (!isValidTaskIdArgs(args)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid task ID parameter");
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
            text: `API request error: ${
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
 * Download image and save locally
 */
async function downloadImage(args: unknown) {
  if (!isValidTaskIdArgs(args)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid task ID parameter");
  }

  try {
    // 1. First check task status
    const statusResponse = await apiClient.get(`/tasks/${args.task_id}`);

    const statusData = statusResponse.data;

    // 2. Check if task completed successfully
    if (statusData.output.task_status !== "SUCCEEDED") {
      return {
        content: [
          {
            type: "text",
            text: `Task not completed or failed: ${JSON.stringify(
              statusData,
              null,
              2
            )}`,
          },
        ],
        isError: true,
      };
    }

    // 3. Get image URLs
    const imageUrls = statusData.output.results.map(
      (result: any) => result.url
    );

    if (!imageUrls || imageUrls.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No image URL found",
          },
        ],
        isError: true,
      };
    }

    // 4. Download all images
    const downloadResults = [];
    // Process save path and base directory
    const typedArgs = args as {
      task_id: string;
      save_path?: string;
      base_dir?: string;
    };

    const customSavePath = typedArgs.save_path;
    // Get base directory - prioritize base_dir from request, then WORK_DIR env var
    const baseDir = typedArgs.base_dir || WORK_DIR;

    let targetDir: string;
    let customFilename: string | null = null;
    let fullSavePath: string;

    if (customSavePath) {
      // Verify path is absolute
      if (!path.isAbsolute(customSavePath)) {
        return {
          content: [
            {
              type: "text",
              text: `Invalid save_path: "${customSavePath}". Must be an absolute path (e.g. /Users/username/Downloads/image.jpg)`,
            },
          ],
          isError: true,
        };
      }
      // Check if customSavePath looks like a file path (has extension)
      const parsedPath = path.parse(customSavePath);
      const hasExtension = parsedPath.ext && parsedPath.base !== parsedPath.dir;

      if (hasExtension) {
        // It has an extension, treat as file path
        // Special handling for single filenames without path separators
        if (
          !customSavePath.includes(path.sep) &&
          !customSavePath.includes("/")
        ) {
          // If it's just a filename without path separators, use baseDir directly
          targetDir = ""; // Empty string will be joined with baseDir later
        } else {
          // If it has path separators, extract the directory part
          targetDir = path.dirname(customSavePath);
        }
        customFilename = parsedPath.base;
      } else {
        // No extension or ends with separator, treat as directory
        targetDir = customSavePath;
      }
    } else {
      // No custom path, use default
      targetDir = SAVE_DIR;
    }

    // Handle directory creation more carefully
    try {
      // For relative paths, join with the base directory
      let absoluteTargetDir: string;

      if (path.isAbsolute(targetDir)) {
        // If it's already an absolute path, use it directly
        absoluteTargetDir = targetDir;
      } else {
        // If it's a relative path or empty string, join with the base directory
        // Using path.join instead of path.resolve for more predictable behavior with empty strings
        absoluteTargetDir = path.join(baseDir, targetDir);
      }

      console.error(
        `Resolving path: ${
          targetDir ? targetDir : "(empty)"
        } against base: ${baseDir} => ${absoluteTargetDir}`
      );

      if (!fs.existsSync(absoluteTargetDir)) {
        fs.mkdirSync(absoluteTargetDir, { recursive: true });
      }

      // Update targetDir to use the absolute path for all subsequent operations
      targetDir = absoluteTargetDir;
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to create directory: ${
              err instanceof Error ? err.message : String(err)
            }`,
          },
        ],
        isError: true,
      };
    }

    for (let i = 0; i < imageUrls.length; i++) {
      const url = imageUrls[i];
      // Use custom filename for the first image if provided, otherwise use default naming
      const filename =
        i === 0 && customFilename ? customFilename : `${args.task_id}_${i}.png`;
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
              message: "Image download completed",
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
            text: `API request error: ${
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
 * Start server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Ali-Flux MCP server running...");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
