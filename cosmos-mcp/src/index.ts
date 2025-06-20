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
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { stringToPath } from '@cosmjs/crypto';
import { toHex } from '@cosmjs/encoding';
import { StargateClient } from "@cosmjs/stargate";


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
const createAccountSchema = z.object({
  prefix: z.string().describe("The Cosmos blockchain address prefix to create account with."),
  coinType: z.string().describe("The BIP44 coin type identification."),
  filepath: z.string().describe("The path on computer to save the account information to. Make sure to ask user this value.")
});

const checkBalanceSchema = z.object({
  accountAddress: z.string().describe("The account's address to check balance for."),
  nodeUrl: z.string().url().describe("The node url to send request to. Make sure to ask user this value."),
});

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "create_account",
        description: "Create an account on a Cosmos appchain.",
        inputSchema: {
          type: "object",
          properties: {
            prefix: {
              type: "string",
              description: "The Cosmos blockchain address prefix to create account with."
            },
            coinType: {
              type: "string",
              description: "The BIP44 coin type identification."
            },
            filepath: {
              type: "string",
              description: "The path on computer to save the account information to. Make sure to ask user this value."
            }
          }
        },
        required: ["chainId", "coinType", "filepath"]
      },
      {
        name: "check_balances",
        description: "Check the balance of an account on Cosmos appchain.",
        inputSchema: {
          type: "object",
          properties: {
            accountAddress: {
              type: "string",
              description: "The account's address to check balance for."
            },
            nodeUrl: {
              type: "string",
              desciption: "The node url to send request to. Make sure to ask user this value."
            }
          },
          required: ["accountAddress", "nodeUrl"]
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
    case "create_account":
      return await createAccount(args);
    case "check_balances":
      return await checkBalances(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

async function createAccount(args: Record<string, unknown>) {
  try {
    const argsObj = createAccountSchema.parse(args);
    const { prefix, coinType, filepath } = argsObj;

    const wallet: DirectSecp256k1HdWallet = await DirectSecp256k1HdWallet.generate(
      24,
      {
        hdPaths: [stringToPath(`m/44'/${coinType}'/0'/0/0`)],
        prefix
      }
    );

    const accounts = await wallet.getAccounts();
    const accountDetails = {
      algo: accounts[0].algo,
      address: accounts[0].address,
      publicKey: toHex(accounts[0].pubkey)
    };

    // Write account details to file
    await fs.writeFile(path.resolve(filepath), JSON.stringify({
      mnemonic: wallet.mnemonic,
      accountDetails
    }));

    // Result returned to agent DOES NOT contain mnemonic
    const result = {
      mnemonicPath: filepath,
      accountDetails,
      note: "Please let user knows that the mnemonic was created and saved. It was never revealed to you."
    };

    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (error) {
    return handleError(error);
  }
}

async function checkBalances(args: Record<string, unknown>) {
  try {
    const argsObj = checkBalanceSchema.parse(args);
    const { accountAddress, nodeUrl } = argsObj;

    const client = await StargateClient.connect(nodeUrl);
    const balances = await client.getAllBalances(accountAddress);

    return { content: [{ type: "text", text: JSON.stringify(balances) }] };
  } catch (error) {
    return handleError(error);
  }
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