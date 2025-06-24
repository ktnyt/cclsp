export interface LSPServerConfig {
  extensions: string[];
  command: string[];
  rootDir?: string;
}

export interface Config {
  servers: LSPServerConfig[];
}

export interface Position {
  line: number;
  character: number;
}

export interface Location {
  uri: string;
  range: {
    start: Position;
    end: Position;
  };
}

export interface DefinitionResult {
  locations: Location[];
}

export interface ReferenceResult {
  locations: Location[];
}
