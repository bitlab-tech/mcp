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

// Define tool schema using zod
const getSourcesSchema = z.object({
  name: z.string().optional().describe("The api source's name to get.")
});

const searchSchema = z.object({
  url: z.string().url().describe("The api url to send request to."),
  queries: z.string().optional().describe("The request's queries in JSON format."),
  headers: z.string().optional().describe("The request's headers in JSON format."),
});

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_sources",
        description: "Get the available sources to query.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "The api source's name to get."
            }
          }
        },
        required: ["name"]
      },
      {
        name: "search",
        description: "Search the source for information.",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "The api url to send request to."
            },
            queries: {
              type: "string",
              desciption: "The request's queries in JSON format."
            },
            headers: {
              type: "string",
              desciption: "The request's headers in JSON format."
            }
          },
          required: ["url", "queries", "headers"]
        }
      }
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
    case "get_sources":
      return await getSources(args);
    case "search":
      return await search(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

async function getSources(args: Record<string, unknown>) {
  try {
    const argsObj = getSourcesSchema.parse(args);
    const { name } = argsObj;

    const sources = await fs.readFile(path.resolve(process.env.APIS_SOURCES ?? ""));
    const sourcesObj = JSON.parse(sources.toString("utf-8"));
    const result = JSON.stringify(name ? sourcesObj[name] : sourcesObj);

    return { content: [{ type: "text", text: result }] };
  } catch (error) {
    return handleError(error);
  }
}

async function search(args: Record<string, unknown>) {
  try {
    const argsObj = searchSchema.parse(args);
    const { url, queries, headers } = argsObj;

    const queriesObj = queries ? JSON.parse(queries) : '';
    const headersObj = headers ? JSON.parse(headers) : '';

    const params = new URLSearchParams(queriesObj);
    const response = await fetch(`${url}?${params}`, {
      method: 'get',
      headers: headersObj,
    });
    const body = await response.json();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(body)
        }
      ]
    };
  } catch (error) {
    return handleError(error);
  }
}

// Function to handle errors
function handleError(error: any) {
  console.error("Error in search_mcp tool:", error);

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
  console.error("Search MCP server running on stdio");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});