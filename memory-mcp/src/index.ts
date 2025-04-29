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

// Create the server
const server = new Server({
  name: "mcp-server",
  version: "1.0.0"
}, {
  capabilities: {
    tools: {}
  }
});

// Define memory structure
interface TopicMemory {
  topic: string,
  notes: string[]
}

interface Memory {
  memories: TopicMemory[]
}

// Define tool schema using zod
const addMemorySchema = z.object({
  topic: z.string().describe("The topic of the memory to be retrieved."),
  note: z.string().describe("The memory content.")
});

const getMemorySchema = z.object({
  topic: z.string().optional().describe("The topic of the memory to be retrieved."),
});

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "add_memory",
        description: "Add new memory",
        inputSchema: {
          type: "object",
          properties: {
            topic: {
              type: "string",
              description: "The topic of the memory to be added."
            },
            note: {
              type: "string",
              description: "The memory content."
            }
          },
          required: ["topic", "note"]
        }
      },
      {
        name: "get_memory",
        description: "Retrieve past memory",
        inputSchema: {
          type: "object",
          properties: {
            topic: {
              type: "string",
              description: "The topic of the memory to be retrieved."
            }
          },
          required: []
        }
      },
    ]
  };
});

// Implement the tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    throw new Error(`No arguments provided for tool: ${name}`);
  }

  switch (name) {
    case "add_memory":
      return await addMemory(args);
    case "get_memory":
      return await getMemory(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Function to add the memory
async function addMemory(args: Record<string, unknown>) {
  try {
    // Parse and validate arguments using zod
    const argsObj = addMemorySchema.parse(args);
    const { topic, note } = argsObj;

    // Read the memory file
    const mem_path = path.resolve(process.env.MEM_PATH ?? "memory.json");
    const memory = JSON.parse(await fs.readFile(mem_path, 'utf8')) as Memory;

    // Add memory
    if (!topic) throw new Error("Topic not specified.");

    const existedMemory = memory.memories?.find((note: TopicMemory) => note.topic === topic);
    if (existedMemory) {
      const isNoteExisted = existedMemory.notes.includes(note);
      if (!isNoteExisted) {
        existedMemory.notes.push(note);
      }
    } else {
      memory.memories.push({
        topic,
        notes: [note]
      });
    }

    await fs.writeFile(mem_path, JSON.stringify(memory));
    return { content: [{ type: "text", text: JSON.stringify(argsObj) }] };

  } catch (error) {
    return handleError(error);
  }
}

// Function to get the memory
async function getMemory(args: Record<string, unknown>) {
  try {
    // Parse and validate arguments using zod
    const argsObj = getMemorySchema.parse(args);

    // Read the memory file
    const mem_path = path.resolve(process.env.MEM_PATH ?? "memory.json");
    const memory = JSON.parse(await fs.readFile(mem_path, 'utf8')) as Memory;

    // Return memory
    const topic = argsObj.topic;
    const result = topic ?
      memory.memories.find((memory: TopicMemory) => memory.topic === topic) :
      memory;
    return { content: [{ type: "text", text: JSON.stringify(result) }] };

  } catch (error) {
    return handleError(error);
  }
}

// Function to handle errors
function handleError(error: any) {
  console.error("Error in get_news tool:", error);

  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `Error searching for news: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    ]
  };
}

// Connect the transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("News MCP server running on stdio");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});