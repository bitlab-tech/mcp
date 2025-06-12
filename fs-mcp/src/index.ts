import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  StdioServerTransport
} from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import z from "zod";
import { promises as fs } from "fs";
import path from "path";
import { FileReader } from "./strategies/fileReader.js";

// Create the server
const server = new Server({
  name: "mcp-server",
  version: "1.0.0"
}, {
  capabilities: {
    tools: {}
  }
});

// Define tool schema using zod
export const fsSchema = z.object({
  uri: z.string().describe("The absolute path of the file/folder."),
  content: z.string().optional().describe("The file content.")
});

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "read_folder",
        description: "Read the folder given the absolute path",
        inputSchema: {
          type: "object",
          properties: {
            uri: {
              type: "string",
              description: "The folder's absolute path."
            }
          },
          required: ["uri"]
        }
      },
      {
        name: "read_file",
        description: "Read the file given the absolute path",
        inputSchema: {
          type: "object",
          properties: {
            uri: {
              type: "string",
              description: "The file's absolute path."
            }
          },
          required: ["uri"]
        }
      },
      {
        name: "create_file",
        description: "Create the file given the absolute path",
        inputSchema: {
          type: "object",
          properties: {
            uri: {
              type: "string",
              description: "The file's absolute path."
            },
            content: {
              type: "string",
              description: "The file's content."
            }
          },
          required: ["uri", "content"]
        }
      }
    ]
  };
});

// Create file reader instance
const fileReader = new FileReader();

// Implement the tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    throw new Error(`No arguments provided for tool: ${name}`);
  }

  switch (name) {
    case "read_folder":
      return await readFolder(args);
    case "read_file":
      return await readFile(args);
    case "create_file":
      return await createFile(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Function to read the folder
async function readFolder(args: Record<string, unknown>) {
  try {
    const argsObj = fsSchema.parse(args);
    const { uri } = argsObj;

    const read = await fs.readdir(path.resolve(uri));
    return { content: [{ type: "text", text: JSON.stringify(read) }] };
  } catch (error) {
    return handleError(error);
  }
}

async function readFile(args: Record<string, unknown>) {
  try {
    const argsObj = fsSchema.parse(args);
    const { uri } = argsObj;

    return await fileReader.readFile(uri);
  } catch (error) {
    return handleError(error);
  }
}

async function createFile(args: Record<string, unknown>) {
  try {
    const { uri, content } = fsSchema.parse(args);
    if (!content) throw new Error("Content is empty");
    await fs.writeFile(uri, content);
    return { content: [{ type: 'text', text: 'File created successfully' }] };
  } catch (error) {
    return handleError(error, 'Error creating file');
  }
}

// Function to handle errors
function handleError(error: unknown, context?: string) {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  const contextMessage = context ? `${context}: ` : '';

  console.error(`Error in dhealth-intelligence:`, error);

  return {
    content: [{
      type: 'text',
      text: `${contextMessage}${errorMessage}`
    }]
  };
}

// Connect the transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("File System MCP server running on stdio");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});