import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  StdioServerTransport
} from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import z from "zod";

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
const getNewsSchema = z.object({
  country: z.string().optional().describe("ISO 3166 country code (e.g. us, vi, jp)"),
  category: z.enum([
    "business",
    "crime",
    "domestic",
    "education",
    "entertainment",
    "environment",
    "food",
    "health",
    "lifestyle",
    "other",
    "politics",
    "science",
    "sports",
    "technology",
    "top",
    "tourism",
    "world"
  ]).optional().describe("News category to search for"),
  page: z.string().optional().describe("The code for next page.")
});

// Helper function to format news result
function formatNews(news: any) {
  return `
  ${news.title}
  -----------------
  Link: ${news.link}
  Description: ${news.description}
  Publish Date: ${news.pubDate}
  Language: ${news.language}
  Country: ${news.country}
  `.trim();
}

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_news",
        description: "Search for latest news by category",
        inputSchema: {
          type: "object",
          properties: {
            country: {
              type: "string",
              description: "ISO 3166 country code (e.g. us, vi for Vietnam instead of vn, jp). Values can be multiple separated by commas or as a JSON string array."
            },
            category: {
              type: "string",
              description: "News category to search for (e.g. dosmestic, lifestyle, sport). Values can be multiple separated by commas or as a JSON string array."
            },
            page: {
              type: "string",
              description: "The page code to search for (e.g. 1745440135523675502)."
            }
          },
          required: []
        }
      }
    ]
  };
});

// Implement the tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "get_news") {
    return await getNews(request);
  }

  // Handle unknown tool
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `Unknown tool: ${request.params.name}`
      }
    ]
  };
});

async function getNews(request: any) {
  try {
    // Parse and validate arguments using zod
    const args = getNewsSchema.parse(request.params.arguments);

    // Make the API call to NEWSDATA
    let url = `${process.env.NEWSDATA_API_URL}?apikey=${process.env.NEWSDATA_API_KEY}`;
    for (const [key, values] of Object.entries(args)) {
      url += `&${key}=${values}`;
    }

    // Query news
    return await queryNews(url, args);

  } catch (error) {
    return handleError(error);
  }
}

async function queryNews(url: string, args: object) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`NewsData API error: ${response.statusText}`);
  }

  const data = await response.json();

  // Check if any drinks were found
  if (!data.results) {
    return {
      content: [
        {
          type: "text",
          text: `No news found matching the arguments. Try a different search term.`
        }
      ]
    };
  }

  // Format each result
  const news = data.results.map(formatNews);

  // Create the formatted response
  const result = `
    Found ${data.totalResults} article(s) matching ${JSON.stringify(args)}:
    \n\n${news.join('\n\n')}
    \n\nNext page code: ${data.nextPage}
  `;

  return {
    content: [
      {
        type: "text",
        text: result
      }
    ]
  };
}

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