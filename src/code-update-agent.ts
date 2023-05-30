import * as fs from 'fs';
import * as path from 'path';
import { Conversation } from './types';
import { sendQuery } from './core';

// reaplcement for string.replaceAll DOES NOT USE STRING.REPLACEALL
function replaceAll(filePath: string, search: string, replace: string) {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split('\n');
    const newLines = lines.map((line) => {
        if(line.includes(search)) {
            return line.replace(search, replace);
        }
        return line;
    });
    return newLines.join('\n');

}

export default class CodeUpdateAgent {
    public readonly fileTree: string[] = [];
    private message: { role: string; content: string; }[] = [{
        role: 'system',
        content: `** YOU ARE NON-CONVERSATIONAL AND HAVE NO ABILITY TO OUTPUT ENGLISH IN A CONVERSATIONAL MANNER **
You are a software enhancement and bug fix agent. Given the following code and request, you output code and documentation changes that satisfy the request.
How to perform your work:
1. Validate that the input given consists of the following:
📬 <deliverable>
📄 <file\nfile\n...>
    1.1 if the input does not consist of the above, output
⛔
    and stop outputting anything else.

2 if the input does consist of the above, examine the deliverable and files, then output:
The entire contents of one or more files:
📄 <filename>
<file contents>
...
Part of the contents of one or more files:
📄 <filename> <start line> <end line>
<partial file contents>
...
📢 <filename> <information about the changes that were performed>
📢 <filename> <information about the changes that were performed>
...
You MUST output an informational record for each file you update.
Thank you for your service! ** REMEMBER, YOU ARE NON-CONVERSATIONAL AND HAVE NO ABILITY TO OUTPUT ENGLISH IN A CONVERSATIONAL MANNER **
--------------------`
    }];
    private delimiters = ['📬', '📢', '📄', '📤', '🔍', '⛔'];
    srcPath: string;
    exclude: string[];
    public conversation: Conversation;
    constructor(srcPath: string, exclude: string[]) {
        this.srcPath = srcPath;
        this.exclude = exclude;
        
        this.fileTree = this.getProjectFileTree(srcPath, exclude);
        this.conversation = {
            messages: this.message,
            settings: {
                key: 'test',
                temperature: 0.7,
                maxTokens: 2048,
                topP: 1,
            }
        };
    }

    private _configure(srcPath: string, exclude: string[]) {
        (this.fileTree as any) = this.getProjectFileTree(srcPath, exclude);
        this.conversation = {
            messages: this.message,
            settings: {
                key: 'test',
                temperature: 0.7,
                maxTokens: 2048,
                topP: 1,
            }
        };
    }

    public reset() {
        this._configure(this.srcPath, this.exclude);
    }

    getProjectFileTree(workingPath: string, exclude: string[], custom?: any): any {
        let filesData: any = [];
        const validExtensions = ['js', 'ts', 'tsx', 'json'];
        if(custom) {
            filesData = custom;
        }
        const items = fs.readdirSync(workingPath);
      
        items.forEach(item => {
          const itemPath = path.join(workingPath, item);
          if(!item) { return; }
          if (exclude.includes(item)) { return; }
          if (fs.statSync(itemPath).isDirectory() && !custom) {
            const filesInSubPath = this.getProjectFileTree(itemPath, exclude);
            filesData = filesData.concat(filesInSubPath);
          } else {
            const content = fs.readFileSync(itemPath, 'utf-8');
            const relativePath = path.relative(path.resolve(workingPath), itemPath);
            filesData.push({ name: relativePath, content: content });
          }
        });
        const output: any = {};
        for (const file of filesData) {
            output[file.name] = file.content;
        }
        return output;
      }

    private parseFromDelimiters(text: string, delimiters: string[]): { delimiter: string, value: string }[] {
        const result = [];
        let current = '';
        if(Array.isArray(text)) text = text.join(' ');
        for (const char of text) {
            if (delimiters.includes(char)) {
                result.push({ delimiter: char, value: current });
                current = '';
            } else {
                current += char;
            }
        }
        if (current) {
            result.push({ delimiter: '', value: current });
        }
        return result;
    }

    // get the total number of tokens in the conversation - break down 
    // each message into tokens, count them, and add them up
    public countConversationTokens() {
        let totalTokens = 0;
        for (const message of this.conversation.messages) {
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
        this._configure(folderPath ? folderPath : this.srcPath, this.exclude);
        this.srcPath = folderPath ? folderPath : this.srcPath;
    }

    async request(ask: string, act: boolean = true) {
        if(ask.trim().length === 0) return;
        this.message.push({ role: 'user', content: `📬 ${ask}` });
        for (const file of Object.keys(this.fileTree)) {
            try {
                const content = `📄 ${file}\n${this.fileTree[file as any]}\n`;
                this.message.push({ role: 'user', content });
            } catch(e) {}
        }

        let trimmedResponse = []
        try {
            // send the query to the assistant
            const response = await sendQuery(this.conversation);
            // get the assistant's response
            trimmedResponse = response.messages.filter((message: any) => {
                return message.role === 'assistant';
            });
        } catch(e) {
            return;
         }

        const parsedResponse: any = [];
        for(const message of trimmedResponse) {
            const parsedResponseItem = message.content;
            parsedResponse.push({
                delimiter: parsedResponseItem.split(' ').slice(0, 1).join(' '),
                value: parsedResponseItem.split(' ').slice(1).join(' ')
            });
        }

        const fileContents: { [key: string]: string } = {};
        const fileChanges: { [key: string]: string } = {};

        for (const parsed of parsedResponse) {
            if (parsed.delimiter === '📄') {
                const parsedMessage = parsed.value.split('\n');
                const parsedMessageTitle = parsedMessage[0];
                const parsedMessageTitleSplit = parsedMessageTitle.split(' ');
                let start = 0, end = 0
                if(parsedMessageTitleSplit.length > 1) {
                    start = parseInt(parsedMessage[1]);
                    end = parseInt(parsedMessage[2]);
                }
                const file = parsed.value.split('\n')[0];
                const fileContent = parsed.value.split('\n').slice(1).join('\n');
                if (start === 0 && end === 0) {
                    fileContents[file] = fileContent; } 
                else {
                    fileContents[file] = fileContents[file].slice(0, start) + fileContent + fileContents[file].slice(end);
                }
                if(act) fs.writeFileSync(
                    path.join(this.srcPath, parsedMessageTitle), 
                    fileContents[file]
                );
            } 
            else if (parsed.delimiter === '📢') {
                const [file, change] = parsed.value.split(' ');
                fileChanges[file] = change;
                if(act) console.log(`📢 ${file} ${change}`);
            }
        }

        // return the file contents and changes
        return { fileContents, fileChanges };
    }
}