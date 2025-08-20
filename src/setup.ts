#!/usr/bin/env node

import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import inquirer from 'inquirer';
import { scanProjectFiles } from './file-scanner.js';
import { LANGUAGE_SERVERS, generateConfig } from './language-servers.js';

// Detailed installation guides for LSP servers
const DETAILED_INSTALL_GUIDES = {
  typescript: {
    title: 'TypeScript/JavaScript Language Server',
    commands: ['npm install -g typescript-language-server typescript'],
    notes: [
      'Requires Node.js to be installed',
      'The typescript package is also required alongside the language server',
      'Verify installation with: typescript-language-server --version',
    ],
  },
  python: {
    title: 'Python Language Server (pylsp)',
    commands: [
      'pip install "python-lsp-server[all]"',
      '# Or basic installation:',
      'pip install python-lsp-server',
    ],
    notes: [
      'Install with [all] extra for complete feature set including linting, formatting',
      'Available via package managers: brew install python-lsp-server',
      'Verify installation with: pylsp --help',
    ],
  },
  go: {
    title: 'Go Language Server (gopls)',
    commands: ['go install golang.org/x/tools/gopls@latest'],
    notes: [
      'Requires Go 1.21 or later to be installed',
      'Official Go language server maintained by the Go team',
      'Most editors with Go support install gopls automatically',
    ],
  },
  rust: {
    title: 'Rust Language Server (rust-analyzer)',
    commands: ['rustup component add rust-analyzer', 'rustup component add rust-src'],
    notes: [
      'rust-src component is required for standard library support',
      'Alternative: Download prebuilt binaries from GitHub releases',
      'Verify installation: rust-analyzer --version',
    ],
  },
  'c-cpp': {
    title: 'C/C++ Language Server (clangd)',
    commands: [
      '# Ubuntu/Debian:',
      'sudo apt install clangd',
      '# macOS:',
      'brew install llvm',
      '# Windows: Download from LLVM releases',
    ],
    notes: [
      'Part of the LLVM project',
      'Available in most package managers as clangd or clang-tools',
      'Disable other C++ extensions to avoid conflicts',
    ],
  },
  java: {
    title: 'Eclipse JDT Language Server',
    commands: [
      '# Download from Eclipse JDT releases:',
      '# https://download.eclipse.org/jdtls/snapshots/',
    ],
    notes: [
      'Requires Java 11 or higher',
      'Unpack to a directory and add to PATH',
      'Most Java IDEs provide automatic setup',
    ],
  },
  ruby: {
    title: 'Ruby Language Server (Solargraph)',
    commands: ['gem install solargraph'],
    notes: [
      'Requires Ruby to be installed',
      'Additional gems may be needed for full functionality',
      'Verify installation with: solargraph --version',
    ],
  },
  php: {
    title: 'PHP Language Server (Intelephense)',
    commands: ['npm install -g intelephense'],
    notes: [
      'Requires Node.js to be installed',
      'Premium features available with license',
      'Verify installation with: intelephense --version',
    ],
  },
  vue: {
    title: 'Vue.js Language Server (Volar)',
    commands: ['npm install -g @vue/language-server'],
    notes: [
      'Requires Node.js to be installed',
      'Official Vue.js language server with full Vue 3 support',
      'Works with TypeScript and JavaScript',
      'Verify installation with: vue-language-server --version',
    ],
  },
  svelte: {
    title: 'Svelte Language Server',
    commands: ['npm install -g svelte-language-server'],
    notes: [
      'Requires Node.js to be installed',
      'Provides IntelliSense for Svelte components',
      'Works with TypeScript and JavaScript',
      'Verify installation with: svelteserver --help',
    ],
  },
};

// Installation commands for automatic installation
const AUTO_INSTALL_COMMANDS = {
  typescript: ['npm', 'install', '-g', 'typescript-language-server', 'typescript'],
  python: ['pip', 'install', 'python-lsp-server[all]'],
  go: ['go', 'install', 'golang.org/x/tools/gopls@latest'],
  rust: [
    ['rustup', 'component', 'add', 'rust-analyzer'],
    ['rustup', 'component', 'add', 'rust-src'],
  ],
  ruby: ['gem', 'install', 'solargraph'],
  php: ['npm', 'install', '-g', 'intelephense'],
  vue: ['npm', 'install', '-g', '@vue/language-server'],
  svelte: ['npm', 'install', '-g', 'svelte-language-server'],
};

async function runCommand(
  command: string[],
  name: string,
  showInstallingMessage = true
): Promise<boolean> {
  return new Promise((resolve) => {
    if (showInstallingMessage) {
      console.log(`🔄 Installing ${name}...`);
    }
    console.log(`   Running: ${command.join(' ')}`);

    const [cmd, ...args] = command;
    if (!cmd) {
      console.log(`❌ No command specified for ${name}`);
      resolve(false);
      return;
    }

    const process = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'] as const,
      shell: false,
    });

    let output = '';
    let error = '';
    let hasErrored = false;

    process.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
    });

    process.stderr?.on('data', (data: Buffer) => {
      error += data.toString();
    });

    process.on('error', (err: NodeJS.ErrnoException) => {
      hasErrored = true;
      console.log(`❌ Failed to install ${name}`);
      console.log(`   Error: ${err.message}`);
      resolve(false);
    });

    process.on('close', (code: number | null) => {
      // Only handle close if we haven't already handled an error
      if (!hasErrored) {
        if (code === 0) {
          console.log(`✅ ${name} installed successfully`);
          resolve(true);
        } else {
          console.log(`❌ Failed to install ${name}`);
          if (error) {
            console.log(`   Error output: ${error.trim()}`);
          }
          if (output) {
            console.log(`   Output: ${output.trim()}`);
          }
          console.log(`   Exit code: ${code}`);
          resolve(false);
        }
      }
    });
  });
}

async function runCommandSilent(
  command: string[]
): Promise<{ success: boolean; output: string; error: string }> {
  return new Promise((resolve) => {
    const [cmd, ...args] = command;
    if (!cmd) {
      resolve({ success: false, output: '', error: 'No command specified' });
      return;
    }

    const process = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'] as const,
      shell: false,
    });

    let output = '';
    let error = '';
    let hasErrored = false;

    process.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
    });

    process.stderr?.on('data', (data: Buffer) => {
      error += data.toString();
    });

    process.on('error', (err: NodeJS.ErrnoException) => {
      hasErrored = true;
      resolve({
        success: false,
        output: output.trim(),
        error: err.message,
      });
    });

    process.on('close', (code: number | null) => {
      // Only handle close if we haven't already handled an error
      if (!hasErrored) {
        resolve({
          success: code === 0,
          output: output.trim(),
          error: error.trim(),
        });
      }
    });
  });
}

export function generateMCPCommand(
  configPath: string,
  isUser: boolean,
  platform: NodeJS.Platform = process.platform
): string {
  // Only resolve if it's a relative path
  const isAbsolute =
    configPath.startsWith('/') ||
    configPath.startsWith('\\') ||
    (configPath.length > 1 && configPath[1] === ':'); // Windows drive letter
  const absoluteConfigPath = isAbsolute ? configPath : resolve(configPath);

  const scopeFlag = isUser ? ' --scope user' : '';
  const isWindows = platform === 'win32';
  const commandPrefix = isWindows ? 'cmd /c ' : '';

  // Quote the path if it contains spaces
  const quotedPath = absoluteConfigPath.includes(' ')
    ? `"${absoluteConfigPath}"`
    : absoluteConfigPath;

  return `claude mcp add cclsp ${commandPrefix}npx cclsp@latest${scopeFlag} --env CCLSP_CONFIG_PATH=${quotedPath}`;
}

export function buildMCPArgs(
  absoluteConfigPath: string,
  isUser: boolean,
  platform: NodeJS.Platform = process.platform
): string[] {
  const mcpArgs = ['mcp', 'add', 'cclsp'];
  const isWindows = platform === 'win32';

  // Add the command with platform-specific prefix
  if (isWindows) {
    mcpArgs.push('cmd', '/c', 'npx', 'cclsp@latest');
  } else {
    mcpArgs.push('npx', 'cclsp@latest');
  }

  // Add scope flag if needed
  if (isUser) {
    mcpArgs.push('--scope', 'user');
  }

  // Add environment variable with proper quoting if path contains spaces
  const quotedPath = absoluteConfigPath.includes(' ')
    ? `"${absoluteConfigPath}"`
    : absoluteConfigPath;
  mcpArgs.push('--env', `CCLSP_CONFIG_PATH=${quotedPath}`);

  return mcpArgs;
}

async function checkExistingCclspMCP(isUser: boolean): Promise<boolean> {
  try {
    // Check if claude command exists, otherwise use local installation
    const { success: claudeExists } = await runCommandSilent(['which', 'claude']);
    const claudeCmd = claudeExists ? 'claude' : join(homedir(), '.claude', 'local', 'claude');

    const scopeFlag = isUser ? '--scope user' : '';
    const listCommand = [claudeCmd, 'mcp', 'list'];
    if (scopeFlag) {
      listCommand.push(scopeFlag);
    }

    const result = await runCommandSilent(listCommand);
    if (!result.success) {
      return false;
    }

    // Check if cclsp is in the output
    return result.output.toLowerCase().includes('cclsp');
  } catch (error) {
    return false;
  }
}

async function installLSPServers(servers: (typeof LANGUAGE_SERVERS)[0][]): Promise<void> {
  console.log('\n🚀 Starting LSP server installation...\n');

  let successCount = 0;
  let totalCount = 0;

  for (const server of servers) {
    const commands = AUTO_INSTALL_COMMANDS[server.name as keyof typeof AUTO_INSTALL_COMMANDS];
    if (!commands) {
      console.log(`⚠️  No automatic installation available for ${server.displayName}`);
      console.log(`   Please install manually: ${server.installInstructions}\n`);
      continue;
    }

    if (Array.isArray(commands[0])) {
      // Multiple commands (like rust-analyzer)
      let allSucceeded = true;
      for (const cmd of commands as string[][]) {
        totalCount++;
        const success = await runCommand(cmd, `${server.displayName} (${cmd.join(' ')})`);
        if (success) {
          successCount++;
        } else {
          allSucceeded = false;
        }
      }
      if (allSucceeded) {
        console.log(`🎉 ${server.displayName} installation completed\n`);
      }
    } else {
      // Single command
      totalCount++;
      const success = await runCommand(commands as string[], server.displayName);
      if (success) {
        successCount++;
        console.log('');
      }
    }
  }

  console.log('📊 Installation Summary:');
  console.log(`   ✅ Successful: ${successCount}/${totalCount}`);
  if (successCount < totalCount) {
    console.log(`   ❌ Failed: ${totalCount - successCount}/${totalCount}`);
    console.log('\n💡 For failed installations, please refer to the detailed guides above');
  }
  console.log('');
}

async function main() {
  console.clear();

  // Check for --user flag
  const isUser = process.argv.includes('--user');

  console.log('🚀 cclsp Configuration Generator\n');

  if (isUser) {
    console.log('👤 User configuration mode\n');
  } else {
    console.log('📁 Project configuration mode (use --user for user config)\n');
  }

  // Scan project files for language detection (only in project mode)
  let recommendedServers: string[] = [];
  if (!isUser) {
    console.log('🔍 Scanning project files for language detection...\n');
    try {
      const projectPath = process.cwd();
      const scanResult = await scanProjectFiles(projectPath, LANGUAGE_SERVERS);
      recommendedServers = scanResult.recommendedServers;

      if (recommendedServers.length > 0) {
        console.log(
          `📝 Detected languages: ${Array.from(scanResult.extensions).sort().join(', ')}`
        );
        console.log(
          `💡 Recommended servers: ${recommendedServers
            .map((name) => LANGUAGE_SERVERS.find((s) => s.name === name)?.displayName)
            .join(', ')}\n`
        );
      } else {
        console.log('📝 No specific languages detected in project\n');
      }
    } catch (error) {
      console.log('⚠️  Could not scan project files, continuing with manual selection\n');
    }
  }

  const { selectedLanguages } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedLanguages',
      message: 'Select the language servers you want to configure:',
      choices: LANGUAGE_SERVERS.map((server) => ({
        name: `${server.displayName} - ${server.description}`,
        value: server.name,
        short: server.displayName,
        checked: recommendedServers.includes(server.name),
      })),
      validate: (input) => {
        if (input.length === 0) {
          return 'Please select at least one language server.';
        }
        return true;
      },
    },
  ]);

  // Show installation instructions for selected languages
  const selectedServers = LANGUAGE_SERVERS.filter((server) =>
    selectedLanguages.includes(server.name)
  );

  if (selectedServers.length > 0) {
    const installRequiredServers = selectedServers.filter(
      (server) => server.installRequired !== false
    );
    const noInstallServers = selectedServers.filter((server) => server.installRequired === false);

    if (installRequiredServers.length > 0) {
      console.log('\n📋 The following LSPs must be installed before using cclsp:\n');
      for (const server of installRequiredServers) {
        console.log(`  • ${server.displayName}`);
        console.log(`    ${server.installInstructions}\n`);
      }
    }

    if (noInstallServers.length > 0) {
      console.log('✨ These language servers work without installation:\n');
      for (const server of noInstallServers) {
        console.log(`  • ${server.displayName} (uses ${server.command[0]})`);
      }
      console.log('');
    }
  }

  const defaultConfigPath = isUser
    ? join(homedir(), '.config', 'claude', 'cclsp.json')
    : join(process.cwd(), '.claude', 'cclsp.json');

  const { configPath } = await inquirer.prompt([
    {
      type: 'input',
      name: 'configPath',
      message: isUser
        ? 'Where should the user configuration file be saved?'
        : 'Where should the project configuration file be saved?',
      default: defaultConfigPath,
      validate: (input) => {
        if (!input.trim()) {
          return 'Please provide a file path.';
        }
        return true;
      },
    },
  ]);

  const { shouldProceed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'shouldProceed',
      message: `Generate ${isUser ? 'user' : 'project'} configuration file at ${configPath}?`,
      default: true,
    },
  ]);

  if (!shouldProceed) {
    console.log('\n❌ Operation cancelled.');
    process.exit(0);
  }

  try {
    const config = generateConfig(selectedLanguages);
    const configJson = JSON.stringify(config, null, 2);

    // Create directory if it doesn't exist
    const configDir = dirname(configPath);
    mkdirSync(configDir, { recursive: true });

    writeFileSync(configPath, configJson);

    console.log(`\n🎉 ${isUser ? 'User' : 'Project'} configuration generated successfully!`);
    console.log(`📁 Configuration saved to: ${configPath}`);
    console.log(`🔧 Selected languages: ${selectedLanguages.join(', ')}`);

    const hasInstallRequired = selectedServers.some((server) => server.installRequired !== false);
    if (hasInstallRequired) {
      console.log('\n⚠️  Please ensure the required LSPs are installed before using cclsp.');
    }

    // Show Claude MCP setup instructions
    const absoluteConfigPath = resolve(configPath);
    const mcpCommand = generateMCPCommand(configPath, isUser);

    console.log('\n🔗 To use cclsp with Claude Code, add it to your MCP configuration:');
    console.log(mcpCommand);

    const { viewConfig } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'viewConfig',
        message: 'Would you like to see the generated configuration?',
        default: false,
      },
    ]);

    if (viewConfig) {
      console.log('\n📄 Generated configuration:');
      console.log(configJson);
    }

    // Show detailed installation guides for required LSPs
    const selectedInstallRequired = selectedServers.filter(
      (server) => server.installRequired !== false
    );
    if (selectedInstallRequired.length > 0) {
      const { showDetailedGuides } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'showDetailedGuides',
          message:
            'Would you like to see detailed installation guides for the required LSP servers?',
          default: true,
        },
      ]);

      if (showDetailedGuides) {
        console.log(`\n${'='.repeat(60)}`);
        console.log('📚 DETAILED LSP INSTALLATION GUIDES');
        console.log('='.repeat(60));

        for (const server of selectedInstallRequired) {
          const guide =
            DETAILED_INSTALL_GUIDES[server.name as keyof typeof DETAILED_INSTALL_GUIDES];
          if (guide) {
            console.log(`\n🔧 ${guide.title}`);
            console.log('-'.repeat(guide.title.length + 4));

            console.log('\n💻 Installation Commands:');
            for (const command of guide.commands) {
              if (command.startsWith('#')) {
                console.log(`\x1b[90m${command}\x1b[0m`); // Gray color for comments
              } else {
                console.log(`  ${command}`);
              }
            }

            console.log('\n📝 Notes:');
            for (const note of guide.notes) {
              console.log(`  • ${note}`);
            }
            console.log('');
          }
        }

        console.log('='.repeat(60));
        console.log('💡 TIP: Copy and run the installation commands for your platform');
        console.log('='.repeat(60));
      }
    }

    // Ask if user wants to install LSPs automatically
    if (selectedInstallRequired.length > 0) {
      const installableServers = selectedInstallRequired.filter(
        (server) => AUTO_INSTALL_COMMANDS[server.name as keyof typeof AUTO_INSTALL_COMMANDS]
      );

      if (installableServers.length > 0) {
        const { shouldInstall } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shouldInstall',
            message: `Do you want to install LSPs now? (${installableServers.map((s) => s.displayName).join(', ')})`,
            default: false,
          },
        ]);

        if (shouldInstall) {
          await installLSPServers(installableServers);
        } else {
          console.log('\n💡 You can install LSPs later using the commands shown above.');
        }
      }
    }

    // Ask if user wants to add cclsp to MCP configuration
    const { shouldAddToMCP } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldAddToMCP',
        message: 'Do you want to add cclsp to your Claude MCP configuration now?',
        default: true,
      },
    ]);

    if (shouldAddToMCP) {
      console.log('\n🔄 Configuring cclsp in Claude MCP...');

      try {
        // Check if claude command exists, otherwise use local installation
        const { success: claudeExists } = await runCommandSilent(['which', 'claude']);
        const claudeCmd = claudeExists ? 'claude' : join(homedir(), '.claude', 'local', 'claude');

        if (!claudeExists) {
          console.log(`   Using local Claude installation at ${claudeCmd}`);
        }

        // Check if cclsp already exists
        const cclspExists = await checkExistingCclspMCP(isUser);

        if (cclspExists) {
          console.log('🔍 Found existing cclsp MCP configuration');
          console.log('🗑️ Removing existing cclsp configuration...');

          const scopeFlag = isUser ? '--scope user' : '';
          const removeSuccess = await runCommand(
            [claudeCmd, 'mcp', 'remove', 'cclsp', scopeFlag].filter(Boolean),
            'remove existing cclsp MCP',
            false
          );
          if (!removeSuccess) {
            console.log('⚠️ Failed to remove existing cclsp configuration, continuing with add...');
          }
        }

        console.log('➕ Adding cclsp to Claude MCP configuration...');

        // Build the MCP add command arguments
        const mcpArgs = buildMCPArgs(absoluteConfigPath, isUser);
        const success = await runCommand([claudeCmd, ...mcpArgs], 'cclsp MCP configuration', false);

        if (success) {
          console.log('🎉 cclsp has been successfully added to your Claude MCP configuration!');
          console.log('\n✨ You can now use cclsp tools in Claude Code:');
          console.log('   • find_definition - Find symbol definitions');
          console.log('   • find_references - Find symbol references');
          console.log('   • rename_symbol - Rename symbols across the codebase');
        } else {
          console.log('\n💡 You can manually add cclsp to your MCP configuration using:');
          console.log(`   ${mcpCommand}`);
        }
      } catch (error) {
        console.log(`\n❌ Failed to configure cclsp in MCP: ${error}`);
        console.log('\n💡 You can manually add cclsp to your MCP configuration using:');
        console.log(`   ${mcpCommand}`);
      }
    } else {
      console.log('\n💡 You can add cclsp to your MCP configuration later using:');
      console.log(`   ${mcpCommand}`);
    }
  } catch (error) {
    console.error(`\n❌ Failed to write configuration file: ${error}`);
    process.exit(1);
  }

  console.log('\n🎯 Happy coding!');
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n❌ Operation cancelled.');
  process.exit(0);
});

// Export main for use as subcommand from index.js
export { main };
