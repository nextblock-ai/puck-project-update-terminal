import * as fs from 'fs';
import * as path from 'path';
import { Conversation } from './types';
import SemanticPrompt from './prompt';

interface DelimiterValue {
    delimiter: string;
    value: string;
};


export class CodeUpdateAgent extends SemanticPrompt {

    fileTree: string[] = [];
    projectPath: string;
    srcPath: string;
    validExtensions: string[] = ['js', 'ts', 'tsx', 'json', 'html', 'css', 'md'];
    exclude: string[];
    conversation: Conversation;

    constructor(srcPath: string, exclude: string[]) {
        super(srcPath);
        this.srcPath = this.projectPath = srcPath;
        this.exclude = exclude;
        this._configure(srcPath, exclude);
        this.fileTree = this.getProjectFileTree(srcPath, exclude);
        this.conversation = {
            messages: this.messages,
            settings: {
                key: 'test',
                temperature: 1,
                maxTokens: 2048,
                topP: 1,
            }
        };
    }

    // get the total number of tokens in the conversation - break down 
    // each message into tokens, count them, and add them up
    public countConversationTokens() {
        let totalTokens = 0;
        for (const message of this.messages) {
            const tokens = message.content.split(' ');
            totalTokens += tokens.length;
        }
        for (const fileName of Object.keys(this.fileTree)) {
            const file = this.fileTree[fileName as any];
            const content = `📄 ${fileName}\n${file}\n`;
            totalTokens += content.split(' ').length;
        }
        return totalTokens;
    }

    public setProjectFiles(files: string[]) {
        (this.fileTree as any) = this.getProjectFileTree(this.srcPath, this.exclude, files);
    }

    public resetProjectFiles(folderPath?: string) {
        // is this a file? if so, get the folder path
        if (folderPath && fs.statSync(folderPath).isFile()) {
            const folderName = path.dirname(folderPath);
            const relPath = path.relative(this.srcPath, folderPath);
            this.fileTree[relPath as any] = fs.readFileSync(folderPath, 'utf-8');

        } else {
            this._configure(folderPath ? folderPath : this.srcPath, this.exclude);
            this.srcPath = folderPath ? folderPath : this.srcPath;
        }
    }

    private _configure(srcPath: string, exclude: string[]) {
        (this.fileTree as any) = this.getProjectFileTree(srcPath, exclude);
        this.conversation = {
            messages: this.messages,
            settings: {
                key: 'test',
                temperature: 1,
                maxTokens: 2048,
                topP: 1,
            }
        };
    }

    public reset() {
        this._configure(this.srcPath, this.exclude);
    }

    async request(ask: string, act: boolean = true) {
        if (ask.trim().length === 0) return;

        const fileNames = Object.keys(this.getProjectFileTree(this.projectPath, this.exclude));

        const semanticPrompt = new SemanticPrompt(this.projectPath);
        semanticPrompt.addMessage({ role: 'user', content: `📬 ${ask}` });
        semanticPrompt.addMessage({ role: 'user', content: `🌳 ${fileNames.join('\n')}` });
        for (const file of Object.keys(this.fileTree)) {
            try {
                const content = `📄 ${file}\n${this.fileTree[file as any]}\n`;
                semanticPrompt.addMessage({ role: 'user', content });
            } catch (e) { }
        }

        // return the file contents and changes
        return semanticPrompt.execute();
    }

    parseFromDelimiters(input: string, delimiters: string[]): DelimiterValue[] {
        const result: DelimiterValue[] = [];
        let start = 0;
        let delimiter = '';
        const matchedDelimiter = delimiters.find(delimiter => input.startsWith(delimiter));
        if (matchedDelimiter) {
            delimiter = matchedDelimiter[0];
            start = matchedDelimiter.length;
        }
        for (let i = 0; i < input.length; i++) {
            const matchedDelimiter = delimiters.find(delimiter => input.slice(i, i + delimiter.length
            ).startsWith(delimiter));

            if (matchedDelimiter) {
                const value = input.slice(start, i);
                result.push({ delimiter: matchedDelimiter, value });
                delimiter = matchedDelimiter;
                i += matchedDelimiter.length - 1; // adjust index to account for delimiter length
                start = i + 1;
            }
        }
        if (start < input.length) {
            result.push({ delimiter, value: input.slice(start) });
        }
        return result;
    }

    getProjectFileTree(workingPath: string, exclude: string[], custom?: string[]): any {
        let filesData: any = [];
        let items;
        if (custom) { items = custom; } else {
            items = fs.readdirSync(workingPath)
        }
        let output: any = {};
        items.forEach(item => {
            const itemPath = path.join(workingPath, item);
            if (!item) { return; }
            if (exclude.includes(item)) { return; }
            if (fs.statSync(itemPath).isDirectory()) {
                const filesInSubPath = this.getProjectFileTree(itemPath, exclude);
                output = Object.assign(output, filesInSubPath);
            } else {
                if (!this.validExtensions.includes(item.split('.').slice(-1)[0])) { return; }
                const content = fs.readFileSync(itemPath, 'utf-8');
                const relativePath = path.relative(path.resolve(workingPath), itemPath);
                output[relativePath] = content;
            }
        });
        return output;
    }


}