declare module 'schemaimporter' {
    export interface SchemaImporterOptions {
        schemaRootFolder?: string;
        excludeSchemasWithImports?: boolean;
        excludeSchemasWithRequiredServerParams?: boolean;
        addAdditionalMetaData?: boolean;
        outputType?: 'onlyPath' | 'onlySchema' | null;
    }

    export class SchemaImporter {
        static loadFromFolder(options: SchemaImporterOptions): Promise<any[]>;
        static loadFromFolderStatic(options: SchemaImporterOptions): Promise<any[]>;
    }
}