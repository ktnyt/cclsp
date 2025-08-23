export interface LSPServerConfig {
  extensions: string[];
  command: string[];
  rootDir?: string;
  restartInterval?: number; // in minutes, optional auto-restart interval
  initializationOptions?: unknown; // LSP initialization options
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

export interface SymbolSearchParams {
  file_path: string;
  symbol_name: string;
  symbol_kind: string;
}

export interface LSPError {
  code: number;
  message: string;
  data?: unknown;
}

export interface LSPLocation {
  uri: string;
  range: {
    start: Position;
    end: Position;
  };
}

export interface DocumentSymbol {
  name: string;
  detail?: string;
  kind: SymbolKind;
  tags?: SymbolTag[];
  deprecated?: boolean;
  range: {
    start: Position;
    end: Position;
  };
  selectionRange: {
    start: Position;
    end: Position;
  };
  children?: DocumentSymbol[];
}

export enum SymbolKind {
  File = 1,
  Module = 2,
  Namespace = 3,
  Package = 4,
  Class = 5,
  Method = 6,
  Property = 7,
  Field = 8,
  Constructor = 9,
  Enum = 10,
  Interface = 11,
  Function = 12,
  Variable = 13,
  Constant = 14,
  String = 15,
  Number = 16,
  Boolean = 17,
  Array = 18,
  Object = 19,
  Key = 20,
  Null = 21,
  EnumMember = 22,
  Struct = 23,
  Event = 24,
  Operator = 25,
  TypeParameter = 26,
}

export enum SymbolTag {
  Deprecated = 1,
}

export interface SymbolInformation {
  name: string;
  kind: SymbolKind;
  tags?: SymbolTag[];
  deprecated?: boolean;
  location: {
    uri: string;
    range: {
      start: Position;
      end: Position;
    };
  };
  containerName?: string;
}

export interface SymbolMatch {
  name: string;
  kind: SymbolKind;
  position: Position;
  range: {
    start: Position;
    end: Position;
  };
  detail?: string;
}

export enum DiagnosticSeverity {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4,
}

export interface DiagnosticRelatedInformation {
  location: Location;
  message: string;
}

export interface CodeDescription {
  href: string;
}

export interface Diagnostic {
  range: {
    start: Position;
    end: Position;
  };
  severity?: DiagnosticSeverity;
  code?: number | string;
  codeDescription?: CodeDescription;
  source?: string;
  message: string;
  tags?: DiagnosticTag[];
  relatedInformation?: DiagnosticRelatedInformation[];
  data?: unknown;
}

export enum DiagnosticTag {
  Unnecessary = 1,
  Deprecated = 2,
}

export interface DocumentDiagnosticReport {
  kind: 'full' | 'unchanged';
  resultId?: string;
  items?: Diagnostic[];
}
