import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  StdioServerTransport
} from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import z from "zod";
import { ImapClient } from "./imap.js";
import { SmtpClient } from "./smtp.js";

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
const readEmailsSchema = z.object({
  folder: z.string().describe("The email folder to read from."),
  noEmails: z.number().describe("The number of emails to read.")
});

const sendEmailSchema = z.object({
  receiver: z.string().describe("The receiver's email address."),
  subject: z.string().describe("The subject of the email."),
  textContent: z.string().describe("The text content of the email."),
  htmlContent: z.string().describe("The html content of the email."),
});

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "read_emails",
        description: "Read the emails from the account.",
        inputSchema: {
          type: "object",
          properties: {
            folder: {
              type: "string",
              description: "The email folder to read from. If not provided, read all emails."
            },
            noEmails: {
              type: "number",
              desciption: "The number of emails to read."
            }
          },
          required: ["folder", "noEmails"]
        }
      },
      {
        name: "send_email",
        description: "Send an email to the given email address.",
        inputSchema: {
          type: "object",
          properties: {
            receiver: {
              type: "string",
              description: "The receiver's email address."
            },
            subject: {
              type: "string",
              description: "The subject of the email."
            },
            textContent: {
              type: "string",
              description: "The text content of the email."
            },
            htmlContent: {
              type: "string",
              description: "The html content of the email."
            }
          },
          required: ["receiver", "subject", "textContent", "htmlContent"]
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
    case "read_emails":
      return await readEmails(args);
    case "send_email":
      return await sendEmail(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

async function readEmails(args: Record<string, unknown>) {
  try {
    const argsObj = readEmailsSchema.parse(args);
    const { folder, noEmails } = argsObj;

    const imapClient = new ImapClient({
      user: process.env.IMAP_USER ?? "",
      password: process.env.IMAP_PASS ?? "",
      host: process.env.IMAP_HOST ?? "",
      port: Number(process.env.IMAP_PORT) ?? 993,
      tls: true,
      tlsOptions: {
        rejectUnauthorized: false
      }
    });
    const emails = await imapClient.readEmails(folder, noEmails);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(emails.map(email => ({
            from: email.from,
            date: email.date,
            inReplyTo: email.inReplyTo,
            replyTo: email.replyTo,
            to: email.to,
            subject: email.subject,
            text: email.text,
          })))
        }
      ]
    }
  } catch (error) {
    return handleError(error);
  }
}

async function sendEmail(args: Record<string, unknown>) {
  try {
    const argsObj = sendEmailSchema.parse(args);
    const { receiver, subject, textContent, htmlContent } = argsObj;

    const smtpClient = new SmtpClient({
      service: process.env.SMTP_SERVICE ?? "",
      host: process.env.SMTP_HOST ?? "",
      port: Number(process.env.SMTP_PORT) ?? 587,
      secure: true,
      auth: {
        user: process.env.SMTP_USER ?? "",
        pass: process.env.SMTP_PASS ?? "",
      },
    });
    const info = await smtpClient.sendEmail(receiver, subject, textContent, htmlContent);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(info)
        }
      ]
    };
  } catch (error) {
    return handleError(error);
  }
}

// Function to handle errors
function handleError(error: any) {
  console.error("Error in email_mcp tool:", error);

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
  console.error("Email MCP server running on stdio");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});