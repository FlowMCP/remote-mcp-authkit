declare module "flowmcp" {
	export class FlowMCP {
		static filterArrayOfSchemas(config: {
			arrayOfSchemas: any[];
			includeNamespaces?: string[];
			excludeNamespaces?: string[];
			activateTags?: string[];
		}): { filteredArrayOfSchemas: any[] };

		static activateServerTools(config: {
			server: any;
			schema: any;
			serverParams: any[];
		}): { mcpTools: any };
	}
}

declare module "schemaimporter" {
	export class SchemaImporter {
		static loadFromFolder(config: {
			excludeSchemasWithImports?: boolean;
			excludeSchemasWithRequiredServerParams?: boolean;
			addAdditionalMetaData?: boolean;
		}): Promise<Array<{ schema: any }>>;
	}
}
