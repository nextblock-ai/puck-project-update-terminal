import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import SemanticPrompt from './prompt';
import { getSemanticAgent } from './core';
import { CodeUpdateAgent } from './code-update-agent';

class AnimatedTerminalBar {
    public static readonly BAR_LENGTH = 20;
    private static readonly BAR_CHAR = '█';
    spinner: any = {
        interval: 150,
        handle: null,
        t: 0,
        tt: 0,
    };
    constructor(public emitter: vscode.EventEmitter<string>) { }
    colorText(text: string, colorIndex: number): string {
        let output = '';
        colorIndex = colorIndex % 7 + 1;
        for (let i = 0; i < text.length; i++) {
            const char = text.charAt(i);
            if (char === ' ' || char === '\r' || char === '\n') {
                output += char;
            } else {
                output += `\x1b[3${colorIndex}m${text.charAt(i)}\x1b[0m`;
            }
        }
        return output;
    }
    private getBar(colorIndex: number, colorRange: number, startColor: number[]) {
        let coloredBar = '';
        for (let i = 0; i < AnimatedTerminalBar.BAR_LENGTH; i++) {
            coloredBar += this.colorText(AnimatedTerminalBar.BAR_CHAR, i + this.spinner.t);
        }
        this.spinner.t = (this.spinner.t+this.spinner.tt) % AnimatedTerminalBar.BAR_LENGTH;
        this.spinner.tt = (this.spinner.tt+1) % 3;
        return coloredBar;
    }
    public start() {
        let colorIndex = 0;
        const colorRange = 256;
        const startColor = [0, 0, 0];
        this.spinner.handle = setInterval(() => {
            const bar = this.getBar(colorIndex, colorRange, startColor);
            this.emitter.fire('\r' + bar);
            colorIndex = (colorIndex + 1) % colorRange;
        }, 100);
        return () => clearInterval(this.spinner.handle);
    }
    public stop() {
        if (this.spinner.handle) {
            clearInterval(this.spinner.handle);
            this.spinner.handle = null;
            this.emitter.fire(
                '\r' + ' '.repeat(AnimatedTerminalBar.BAR_LENGTH) + '\r\n'
            );
        }
    }
}

export function activate(context: vscode.ExtensionContext) {

    let projectRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
    projectRoot = path.join(projectRoot, '');
    const excluded = ['node_modules', '.git', '.vscode'];
    const writeEmitter = new vscode.EventEmitter<string>();
    const codeUpdateAgent = new CodeUpdateAgent(projectRoot, ['node_modules', '.git', '.vscode','history.json']);
    const bar = new AnimatedTerminalBar(writeEmitter);
    const commandHistory: string[] = [];

    context.subscriptions.push(vscode.commands.registerCommand('puck-project-update-terminal.projectUpdateTerminal', () => {
        let line = '';
        let working = false;
        let performUpdates = true;
        function summaryInfo() {
            writeEmitter.fire(`${Object.keys(codeUpdateAgent.fileTree).length} files, ${codeUpdateAgent.countConversationTokens()} tokens\r\n\r\n`);
        }
        const pty = {
            onDidWrite: writeEmitter.event,
            open: () => {
                writeEmitter.fire('Project Source Code update agent\r\n');
                writeEmitter.fire('Type a command or \'help\' for help.\r\n');
                summaryInfo();
                prompt();
            },
            close: () => { /* noop*/ },
            handleInput: async (data: string) => {
                if (data === '\x1b[A') { // Up arrow
                    writeEmitter.fire(
                        '\r' + ' '.repeat(AnimatedTerminalBar.BAR_LENGTH)
                    );
                    if (commandHistory.length > 0) {
                        line = commandHistory.pop()!;
                        writeEmitter.fire(`\r${line}`);
                    }
                    return;
                }
                if (data === '\x1b[B') { // Down arrow
                    writeEmitter.fire(
                        '\r' + ' '.repeat(AnimatedTerminalBar.BAR_LENGTH)
                    );
                    if (commandHistory.length > 0) {
                        line = commandHistory.pop()!;
                        writeEmitter.fire(`\r${line}`);
                    }
                    return;
                }
                if (working) {
                    return;
                }
                if (data === '\r') { // Enter
                    writeEmitter.fire('\r\n');
                    commandHistory.push(line);
                    if (line === 'clear') {
                        clear();
                        line = '';
                        prompt();
                        return;
                    }
                    else if (line === 'reset') {
                        codeUpdateAgent.reset();
                        writeEmitter.fire(`\r\nresetting conversation...\r\n\n`);
                        line = '';
                        prompt();
                        return;
                    }
                    else if (line === 'open') {
                        // get a list of all the open project files
                        const openFiles = vscode.window.visibleTextEditors.map(e => e.document.fileName);
                        codeUpdateAgent.setProjectFiles(openFiles);
                        for (const fileName of openFiles) {
                            const content = `📄 ${fileName}\r\n`;
                            writeEmitter.fire(`${content}`);
                        }
                        line = '';
                        prompt();
                        return;
                    }
                    else if (line === 'all') {
                        codeUpdateAgent.resetProjectFiles();
                        line = '';
                        summaryInfo();
                        prompt();
                        return;
                    }
                    else if (line === 'list') {
                        const files = Object.keys(codeUpdateAgent.fileTree);
                        for (const fileName of files) {
                            const content = `📄 ${fileName}\r\n`;
                            writeEmitter.fire(`${content}`);
                        }
                        line = '';
                        prompt();
                        return;
                    }
                    else if (line === 'summary') {
                        summaryInfo();
                        line = '';
                        prompt();
                        return;
                    }
                    else if (line.startsWith('extension')) {
                        const parts = line.split(' ');
                        const action = parts[1];
                        const value = parts[2];
                        if (action === 'add') {
                            codeUpdateAgent.validExtensions.push(value);
                            writeEmitter.fire(`\r\nadded extension ${value}\r\n`);
                        } else if (action === 'remove') {
                            const index = codeUpdateAgent.validExtensions.indexOf(value);
                            if (index >= 0) {
                                codeUpdateAgent.validExtensions.splice(index, 1);
                            }
                            writeEmitter.fire(`\r\nremoved extension ${value}\r\n`);
                        } else if (action === 'list') {
                            for (const ext of codeUpdateAgent.validExtensions) {
                                writeEmitter.fire(`${ext}\r\n`);
                            }
                        }
                        line = '';
                        summaryInfo();
                        prompt();
                        return;
                    }
                    else if (line.startsWith('load')) {
                        const parts = line.split(' ');
                        const pathName = parts[1];
                        let projectPath: any = path.join(projectRoot, pathName)
                        codeUpdateAgent.resetProjectFiles(projectPath);
                        line = '';
                        summaryInfo();
                        prompt();
                        return;
                    }
                    else if (line.startsWith('add')) {
                        const parts = line.split(' ');
                        if(parts.length < 2) {
                            writeEmitter.fire(`\r\nadd requires a path\r\n`);
                            line = '';
                            prompt();
                            return;
                        }
                        if(parts[1] === 'open') {
                            const openFiles = vscode.window.visibleTextEditors.map(e => e.document.fileName);
                            for (const fileName of openFiles) {
                                const content = fs.readFileSync(fileName, 'utf-8');
                                const relativePath = path.relative(path.resolve(projectRoot), fileName);
                                codeUpdateAgent.fileTree[relativePath as any] = content;
                                writeEmitter.fire(`${fileName}\r\n`);
                            }
                            line = '';
                            prompt();
                            return;
                        }

                        const pathName = parts[1];
                        const projectPath = path.join(projectRoot, pathName);
                        // does the path exist?
                        if (fs.existsSync(projectPath)) {
                            // is it a file or a directory?
                            const stat = fs.statSync(projectPath);
                            if (stat.isDirectory()) {
                                // add all the files in the directory
                                const files = fs.readdirSync(projectPath);
                                for (const file of files) {
                                    const filePath = path.join(projectPath, file);
                                    const content = fs.readFileSync(filePath, 'utf-8');
                                    const relativePath = path.relative(path.resolve(projectRoot), filePath);
                                    codeUpdateAgent.fileTree[relativePath as any] = content;
                                }
                            }
                            else {
                                const filePath = path.join(projectPath);
                                const content = fs.readFileSync(filePath, 'utf-8');
                                const relativePath = path.relative(path.resolve(projectRoot), filePath);
                                codeUpdateAgent.fileTree[relativePath as any] = content;
                            }
                        }
                        line = '';
                        summaryInfo();
                        prompt();
                        return;
                    }
                    else if (line.startsWith('remove')) {
                        const parts = line.split(' ');
                        const pathName = parts[1];
                        delete codeUpdateAgent.fileTree[pathName as any];
                        line = '';
                        summaryInfo();
                        prompt();
                        return;
                    }
                    else if (line.startsWith('tokens')) {
                        const parts = line.split(' ');
                        const numTokens = parts[1];
                        codeUpdateAgent.conversation.settings.maxTokens = parseInt(numTokens);
                        line = '';
                        summaryInfo();
                        prompt();
                        return;
                    }
                    else if (line.startsWith('history')) {
                        for (const command of commandHistory) {
                            writeEmitter.fire(`${command}\r\n`);
                        }
                        prompt();
                        return;
                    }
                    else if (line === 'help') {
                        writeEmitter.fire(`\r\nCommands:\r\n`);
                        writeEmitter.fire(`\r\n'clear' - clear the terminal\r\n`);
                        writeEmitter.fire(`'open' - set file buffer to open VS Code files\r\n`);
                        writeEmitter.fire(`'all' - reset the project files to all files\r\n`);
                        writeEmitter.fire(`'list' - list all project files\r\n`);
                        writeEmitter.fire(`'summary' - show summary information\r\n`);
                        writeEmitter.fire(`'extension add <ext>' - add a file extension to the list of valid extensions\r\n`);
                        writeEmitter.fire(`'extension remove <ext>' - remove a file extension from the list of valid extensions\r\n`);
                        writeEmitter.fire(`'load <path>' - load a project from a different path\r\n`);
                        writeEmitter.fire(`'add <path>' - add a file or directory to the project\r\n`);
                        writeEmitter.fire(`'add open' - add all open files to the project\r\n`);
                        writeEmitter.fire(`'remove <path>' - remove a file from the project\r\n`);
                        writeEmitter.fire(`'tokens <num>' - set the number of tokens to generate\r\n`);
                        writeEmitter.fire(`'reset' - reset the conversation\r\n`);
                        writeEmitter.fire(`'*' - toggle auto-updates\r\n`);
                        writeEmitter.fire(`'help' - show help\r\n`);
                        line = '';
                        prompt();
                        return;
                    }
                    if (line === '*') {
                        performUpdates = !performUpdates;
                        writeEmitter.fire(`\r\${performUpdates ? 'enabling' : 'disabling' } auto-updates...\r\n\n`);
                        line = '';
                        prompt();
                        return;
                    }
                    working = true;
                    if (line.startsWith('*')) {
                        line = line.substring(1, line.length - 1);
                        performUpdates = true;
                        writeEmitter.fire(`\r\nenabling auto-updates...\r\n\n`);
                    }
                    bar.start();
                    let result;
                    try {
                        result = await codeUpdateAgent.request(line);
                    } catch (e) {
                        working = false;
                        writeEmitter.fire(`\r\n${e}\r\n`);
                        prompt();
                        return;
                    }
                    if (!result) {
                        working = false;
                        writeEmitter.fire(`\r\nno response from server\r\n`);
                        prompt();
                        return;
                    }
                    line = '';
                    bar.stop();
                    if (!result) {
                        working = false;
                        prompt();
                        return;
                    }
                    const fileChanges = result.fileChanges;
                    if(fileChanges) {
                        const changedFileNames = Object.keys(fileChanges);
                        if (changedFileNames && changedFileNames.length > 0) {
                            if (performUpdates) writeEmitter.fire(`\r\nperformed ${changedFileNames.length} file updates:\r\n`);
                            else writeEmitter.fire(`\r\suggesting ${changedFileNames.length} file updates:\r\n`);
                            for (const fileName of changedFileNames) {
                                writeEmitter.fire(`\r\n${fileName}\r\n`);
                                writeEmitter.fire(`${fileChanges[fileName]}\r\n`);
                            }
                        };
                    }
                    working = false;
                    line = '';
                    summaryInfo();
                    prompt();
                    return;
                }
                if (data === '\x7f') { // Backspace
                    if (line.length === 0) {
                        return;
                    }
                    line = line.substr(0, line.length - 1);
                    // Move cursor backward
                    writeEmitter.fire('\x1b[D');
                    // Delete character
                    writeEmitter.fire('\x1b[P');
                    return;
                }
                line += data;
                writeEmitter.fire(data);
            }
        };
        const terminal = vscode.window.createTerminal({ name: `Project Source Code update agent`, pty });
        terminal.show();
    }));

    function output(text: string) {
        writeEmitter.fire(text);
    }

    function clear() {
        writeEmitter.fire('\x1b[2J\x1b[3J\x1b[;H');
    }

    function prompt() {
        writeEmitter.fire('\r\n> ');
    }
}

