import { Server } from "@modelcontextprotocol/sdk/server";
import {
  StdioServerTransport
} from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { Auth } from "./utils/auth.js";
import { GDriveFileReader } from "./strategies/gdriveFileReader.js";
import axios from "axios";

const authConfig = {
  clientId: process.env.CLIENT_ID ?? "",
  clientSecret: process.env.CLIENT_SECRET ?? "",
  tokenHost: "https://oauth2.googleapis.com",
  tokenPath: "/token",
  authorizeHost: "https://accounts.google.com",
  authorizePath: "/o/oauth2/v2/auth",
  callbackURL: "http://localhost:42813/oauth2callback",
  scopes: 'https://www.googleapis.com/auth/drive.readonly',
  callbackPort: 42813
};

const auth = new Auth(authConfig);
const gfileReader = new GDriveFileReader();

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
export const gdriveSchema = z.object({
  identifier: z.string().describe("The name or ID of the file/folder.")
});

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "read_gdrive_folder",
        description: "Read the Google Drive folder given the name or ID (empty for root)",
        inputSchema: {
          type: "object",
          properties: {
            identifier: {
              type: "string",
              description: "The folder's name or ID."
            }
          },
          required: ["identifier"]
        }
      },
      {
        name: "read_gdrive_file",
        description: "Read the file given the absolute path",
        inputSchema: {
          type: "object",
          properties: {
            identifier: {
              type: "string",
              description: "The file's name or ID."
            }
          },
          required: ["identifier"]
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
    case "read_gdrive_folder":
      return await readGDriveFolder(args);
    case "read_gdrive_file":
      return await readGDriveFile(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

async function readGDriveFolder(args: Record<string, unknown>) {
  // parse identifier
  const { identifier } = gdriveSchema.parse(args);

  return auth.executeWithAuth(async () => {
    const accessToken = await auth.ensureValidToken();

    // Build Drive API query
    let q: string;
    if (!identifier) {
      // list root
      q = "'root' in parents and trashed = false";
    } else if (/^[a-zA-Z0-9_-]{10,}$/.test(identifier)) {
      // likely an ID
      q = `'${identifier}' in parents and trashed = false`;
    } else {
      // try to find folder by name, then list its children
      // first find folder id by name
      const findFolderUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        `name='${identifier.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
      )}&fields=files(id,name)`;

      const findResp = await axios.get(findFolderUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const findJson = findResp.data;
      const folder = Array.isArray(findJson.files) && findJson.files[0];
      if (!folder) {
        handleError('Folder not found: ' + identifier);
      }
      q = `'${folder.id}' in parents and trashed = false`;
    }

    const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size)`;
    const listResp = await axios.get(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const listJson = listResp.data;

    return { content: [{ type: 'text', text: JSON.stringify(listJson) }] };
  });
}

async function readGDriveFile(args: Record<string, unknown>) {
  // parse identifier
  const { identifier } = gdriveSchema.parse(args);

  return auth.executeWithAuth(async () => {
    const accessToken = await auth.ensureValidToken();

    if (!identifier) {
      handleError('Missing identifier for readGDriveFile');
    }

    // resolve file id and metadata
    let fileId = identifier;
    let mimeType: string | undefined;

    if (!/^[a-zA-Z0-9_-]{10,}$/.test(identifier)) {
      // treat as name, search for file
      const findUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        `name='${identifier.replace(/'/g, "\\'")}' and trashed=false`
      )}&fields=files(id,name,mimeType,size)`;

      const findResp = await axios.get(findUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const findJson = findResp.data;
      const file = Array.isArray(findJson.files) && findJson.files[0];
      if (!file) throw new Error('File not found: ' + identifier);
      fileId = file.id;
      mimeType = file.mimeType;
    }

    // If we don't already have mimeType (because identifier was an ID), fetch metadata
    if (!mimeType) {
      const metaUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size`;
      const metaResp = await axios.get(metaUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      mimeType = metaResp.data.mimeType;
    }

    // Handle Google Workspace files (export) vs regular files (download)
    const exportMap: Record<string, string> = {
      'application/vnd.google-apps.document': 'text/plain',
      'application/vnd.google-apps.spreadsheet': 'text/csv',
      'application/vnd.google-apps.presentation': 'application/pdf',
    };

    let dataBuffer: Buffer;
    let resultMime = mimeType;

    if (mimeType && exportMap[mimeType]) {
      const exportMime = exportMap[mimeType];
      const exportUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportMime)}`;
      const resp = await axios.get(exportUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        responseType: 'arraybuffer',
      });
      dataBuffer = Buffer.from(resp.data);
      resultMime = exportMime;
    } else {
      // download file contents
      const downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
      const resp = await axios.get(downloadUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        responseType: 'arraybuffer',
      });
      dataBuffer = Buffer.from(resp.data);
    }

    return gfileReader.readFile(resultMime, dataBuffer);
  });
}

// Function to handle errors
function handleError(error: any) {
  console.error("Error in cosmos_mcp tool:", error);

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
  console.error("Cosmos MCP server running on stdio");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});