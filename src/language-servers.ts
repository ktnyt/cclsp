export interface LanguageServerConfig {
  name: string;
  displayName: string;
  extensions: string[];
  command: string[];
  installInstructions: string;
  rootDir?: string;
  description?: string;
  installRequired?: boolean;
}

export const LANGUAGE_SERVERS: LanguageServerConfig[] = [
  {
    name: 'typescript',
    displayName: 'TypeScript/JavaScript',
    extensions: ['js', 'ts', 'jsx', 'tsx'],
    command: ['npx', '--', 'typescript-language-server', '--stdio'],
    installInstructions: 'npm install -g typescript-language-server',
    description: 'TypeScript and JavaScript language server',
    installRequired: false,
  },
  {
    name: 'python',
    displayName: 'Python',
    extensions: ['py', 'pyi'],
    command: ['uvx', '--from', 'python-lsp-server', 'pylsp'],
    installInstructions: 'pip install python-lsp-server',
    description: 'Python Language Server Protocol implementation',
    installRequired: false,
  },
  {
    name: 'go',
    displayName: 'Go',
    extensions: ['go'],
    command: ['gopls'],
    installInstructions: 'go install golang.org/x/tools/gopls@latest',
    description: 'Official language server for the Go language',
    installRequired: true,
  },
  {
    name: 'rust',
    displayName: 'Rust',
    extensions: ['rs'],
    command: ['rust-analyzer'],
    installInstructions: 'rustup component add rust-analyzer',
    description: 'Rust language server providing IDE-like features',
    installRequired: true,
  },
  {
    name: 'c-cpp',
    displayName: 'C/C++',
    extensions: ['c', 'cpp', 'cc', 'h', 'hpp'],
    command: ['clangd'],
    installInstructions: 'Install clangd via your system package manager',
    description: 'LLVM-based language server for C and C++',
    installRequired: true,
  },
  {
    name: 'java',
    displayName: 'Java',
    extensions: ['java'],
    command: ['jdtls'],
    installInstructions: 'Download Eclipse JDT Language Server',
    description: 'Eclipse JDT Language Server for Java',
    installRequired: true,
  },
  {
    name: 'ruby',
    displayName: 'Ruby',
    extensions: ['rb'],
    command: ['solargraph', 'stdio'],
    installInstructions: 'gem install solargraph',
    description: 'Ruby language server providing IntelliSense',
    installRequired: true,
  },
  {
    name: 'php',
    displayName: 'PHP',
    extensions: ['php'],
    command: ['intelephense', '--stdio'],
    installInstructions: 'npm install -g intelephense',
    description: 'PHP language server with advanced features',
    installRequired: true,
  },
  {
    name: 'csharp',
    displayName: 'C#',
    extensions: ['cs'],
    command: ['omnisharp', '-lsp'],
    installInstructions: 'Install OmniSharp language server',
    description: 'Language server for C# and .NET',
    installRequired: true,
  },
  {
    name: 'swift',
    displayName: 'Swift',
    extensions: ['swift'],
    command: ['sourcekit-lsp'],
    installInstructions: 'Comes with Swift toolchain',
    description: 'Language server for Swift programming language',
    installRequired: true,
  },
  {
    name: 'kotlin',
    displayName: 'Kotlin',
    extensions: ['kt', 'kts'],
    command: ['kotlin-language-server'],
    installInstructions: 'Download from kotlin-language-server releases',
    description: 'Language server for Kotlin programming language',
    installRequired: true,
  },
  {
    name: 'dart',
    displayName: 'Dart/Flutter',
    extensions: ['dart'],
    command: ['dart', 'language-server'],
    installInstructions: 'Install with Dart SDK',
    description: 'Dart language server for Dart and Flutter development',
    installRequired: true,
  },
  {
    name: 'elixir',
    displayName: 'Elixir',
    extensions: ['ex', 'exs'],
    command: ['elixir-ls'],
    installInstructions: 'Install ElixirLS language server',
    description: 'Language server for Elixir programming language',
    installRequired: true,
  },
  {
    name: 'haskell',
    displayName: 'Haskell',
    extensions: ['hs', 'lhs'],
    command: ['haskell-language-server-wrapper', '--lsp'],
    installInstructions: 'Install via ghcup or stack',
    description: 'Haskell Language Server for Haskell development',
    installRequired: true,
  },
  {
    name: 'lua',
    displayName: 'Lua',
    extensions: ['lua'],
    command: ['lua-language-server'],
    installInstructions: 'Install lua-language-server',
    description: 'Language server for Lua programming language',
    installRequired: true,
  },
];

export function generateConfig(selectedLanguages: string[]): object {
  const selectedServers = LANGUAGE_SERVERS.filter((server) =>
    selectedLanguages.includes(server.name)
  );

  return {
    servers: selectedServers.map((server) => ({
      extensions: server.extensions,
      command: server.command,
      rootDir: server.rootDir || '.',
    })),
  };
}
