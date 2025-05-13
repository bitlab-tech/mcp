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
const readEntitySchema = z.object({
  uri: z.string().describe("The absolute path of the file/folder."),
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
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Function to read the folder
async function readFolder(args: Record<string, unknown>) {
  try {
    const argsObj = readEntitySchema.parse(args);
    const { uri } = argsObj;

    const read = await fs.readdir(path.resolve(uri));
    return { content: [{ type: "text", text: JSON.stringify(read) }] };
  } catch (error) {
    return handleError(error);
  }
}

async function readFile(args: Record<string, unknown>) {
  try {
    const argsObj = readEntitySchema.parse(args);
    const { uri } = argsObj;

    return await fileReader.readFile(uri);
  } catch (error) {
    return handleError(error);
  }
}

// Function to handle errors
function handleError(error: any) {
  console.error("Error in files_mcp tool:", error);

  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    ]
  };
}

// Connect the transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Files MCP server running on stdio");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});