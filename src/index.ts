import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { FlowMCP } from "flowmcp";
import { z } from "zod";
import { AuthkitHandler } from "./authkit-handler";
import type { Props } from "./props";
import { SchemaImporter } from 'schemaimporter'

export class MyMCP extends McpAgent<Env, unknown, Props> {
	// @ts-ignore - Type compatibility issue between different MCP SDK versions
	server = new McpServer({
		name: "FlowMCP Schema Server with AuthKit",
		version: "1.0.0",
	});

	async init() {
		// Load environment configuration with defaults
		const env = (globalThis as any).env || {};
		console.log("Environment variables:", env);

		const config = {
			cfgSchemaImporter: {
				excludeSchemasWithImports:
					(env.SCHEMA_EXCLUDE_IMPORTS || "true") === "true",
				excludeSchemasWithRequiredServerParams:
					(env.SCHEMA_EXCLUDE_SERVER_PARAMS || "true") === "true",
				addAdditionalMetaData: (env.SCHEMA_ADD_METADATA || "false") === "true",
			},
			cfgFilterArrayOfSchemas: {
				includeNamespaces: env.FILTER_INCLUDE_NAMESPACES
					? env.FILTER_INCLUDE_NAMESPACES.split(",")
					: [],
				excludeNamespaces: env.FILTER_EXCLUDE_NAMESPACES
					? env.FILTER_EXCLUDE_NAMESPACES.split(",")
					: [],
				activateTags: env.FILTER_ACTIVATE_TAGS
					? env.FILTER_ACTIVATE_TAGS.split(",")
					: [],
			},
		};
		console.log("Config:", config);

		// Load schemas using static import
		const arrayOfSchemas = await SchemaImporter
			.loadFromFolderStatic( {
				excludeSchemasWithImports: config.cfgSchemaImporter.excludeSchemasWithImports,
				excludeSchemasWithRequiredServerParams: config.cfgSchemaImporter.excludeSchemasWithRequiredServerParams,
				addAdditionalMetaData: config.cfgSchemaImporter.addAdditionalMetaData
			} )
		console.log(`Loaded ${arrayOfSchemas.length} schemas`)

		// Filter schemas based on configuration
		const { filteredArrayOfSchemas } = FlowMCP
			.filterArrayOfSchemas({
				arrayOfSchemas,
				includeNamespaces: config.cfgFilterArrayOfSchemas.includeNamespaces,
				excludeNamespaces: config.cfgFilterArrayOfSchemas.excludeNamespaces,
				activateTags: config.cfgFilterArrayOfSchemas.activateTags
			} )
		console.log(`Filtered to ${filteredArrayOfSchemas.length} schemas`)

		// Register schemas as MCP tools
		for( const schema of filteredArrayOfSchemas ) {
			try {
				FlowMCP.activateServerTools({
					server: this.server,
					schema,
					serverParams: []
				} )
			} catch (error) {
				console.error(`Failed to activate schema ${schema.namespace}:`, error)
			}
		}

		console.log('Schema registration completed');

		// Always register a basic ping tool for testing
		this.server.tool("ping", {}, async () => ({
			content: [{ type: "text", text: "pong - FlowMCP Server with AuthKit is running!" }],
		}));
		// Add a basic addition tool for testing
		this.server.tool(
			"add",
			"Add two numbers the way only MCP can",
			{ a: z.number(), b: z.number() },
			async ({ a, b }) => ({
				content: [{ type: "text", text: String(a + b) }],
			}),
		);

		// Dynamically add tools based on the user's permissions. They must have the
		// `image_generation` permission to use this tool.
		if (this.props!.permissions.includes("image_generation")) {
			this.server.tool(
				"generateImage",
				"Generate an image using the `flux-1-schnell` model. Works best with 8 steps.",
				{
					prompt: z
						.string()
						.describe("A text description of the image you want to generate."),
					steps: z
						.number()
						.min(4)
						.max(8)
						.default(4)
						.describe(
							"The number of diffusion steps; higher values can improve quality but take longer. Must be between 4 and 8, inclusive.",
						),
				},
				async ({ prompt, steps }) => {
					// TODO: Update the `McpAgent` type to pass its `Env` generic parameter
					// down to the `DurableObject` type it extends to avoid this cast.
					const env = this.env as Env;

					const response = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
						prompt,
						steps,
					});

					return {
						content: [
							{
								type: "image",
								data: response.image!,
								mimeType: "image/jpeg",
							},
						],
					};
				},
			);
		}
	}
}

// Custom handler that combines OAuth and MCP functionality
const createCombinedHandler = () => {
	return (request: Request, env: Env, ctx: ExecutionContext) => {
		const url = new URL(request.url);
		const routePath = env.ROUTE_PATH || "/mcp";

		// Store environment in global for access in MyMCP.init()
		(globalThis as any).env = env;

		// Handle MCP routes
		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		if (url.pathname === routePath) {
			return MyMCP.serve(routePath).fetch(request, env, ctx);
		}

		// For all other routes, delegate to AuthkitHandler
		return AuthkitHandler.fetch(request, env, ctx);
	};
};

export default new OAuthProvider({
	apiRoute: "/sse",
	apiHandler: createCombinedHandler() as any, // Use 'any' for maximum flexibility
	defaultHandler: AuthkitHandler.fetch as any, // Use 'any' for maximum flexibility
	authorizeEndpoint: "/authorize",
	tokenEndpoint: "/token",
	clientRegistrationEndpoint: "/register",
});
