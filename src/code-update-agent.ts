import * as fs from 'fs';
import * as path from 'path';
import { Conversation } from './types';
import { sendQuery } from './core';
import SemanticPrompt from './prompt';


const prompt =  `** YOU ARE NON-CONVERSATIONAL AND HAVE NO ABILITY TO OUTPUT ENGLISH IN A CONVERSATIONAL MANNER **

you create, enhance, fix, document code as asked. 

How to perform your work:

1. VALIDATE INPUT

Validate that the input given consists of the following:

📬 <deliverable>
🌳 <source file list>
📄 <file name>
...
📄 <file name>
OPTIONAL:
📤 <filename>
...
📤 <filename>

If the input does not consist of the above, then output
⛔ and stop outputting anything else.

If the input is valid then move to step 2.

2. DETERMINE SCOPE OF WORK AND OPTIONALLY REQUEST ADDITIONAL FILES

Examine the deliverable and files provided to you. If you need additional files to complete your work, then request them
by outputting:

📤 <filename>

for each file you need, then wait for a response from the user. 
When you receive a response, then move to step 3.

3. PERFORM WORK AND OUTPUT RESULTS

Perform the work required to satisfy the deliverable. Output file updates / new files like this:

📄 <filename>
<file contents>

or

📄 <filename> <start line> <end line>
<partial file contents>

4. OUTPUT CHANGES

Output changes to the files you have worked on like this:

📢 <filename> <natural-language english information about the changes that were performed>

*** NO MARKDOWN - NO CONVERSATION - NO OTHER FORMAT THAN THE ONE SPECIFIED ABOVE ***

Thank you for your service! 
** REMEMBER, YOU ARE NON-CONVERSATIONAL AND HAVE NO ABILITY TO OUTPUT ENGLISH IN A CONVERSATIONAL MANNER **
--------------------`;

interface DelimiterValue {
    delimiter: string;
    value: string;
  };


export default class CodeUpdateAgent {
    public readonly fileTree: string[] = [];
    private message: { role: string; content: string; }[] = [{
        role: 'system',
        content: prompt
    }];
    private delimiters = ['📬', '📢', '📄', '📤', '🔍', '⛔'];
    projectPath: string;
    validExtensions: string[] = ['js', 'ts', 'tsx', 'json', 'md'];
    srcPath: string;
    exclude: string[];
    public conversation: Conversation;
    constructor(srcPath: string, exclude: string[]) {
        this.srcPath = srcPath;
        this.projectPath = srcPath;
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
      
    // get the total number of tokens in the conversation - break down 
    // each message into tokens, count them, and add them up
    public countConversationTokens() {
        let totalTokens = 0;
        for (const message of this.message) {
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
        if (ask.trim().length === 0) return;

        const fileNames = Object.keys(this.getProjectFileTree(this.projectPath, this.exclude));
        
        const semanticPrompt = new SemanticPrompt(this.projectPath);
        semanticPrompt.addMessage({ role: 'user', content: `📬 ${ask}` });
        semanticPrompt.addMessage({ role: 'system', content: `🌳 ${fileNames.join('\n')}` });
        for (const file of Object.keys(this.fileTree)) {
            try {
                const content = `📄 ${file}\n${this.fileTree[file as any]}\n`;
                semanticPrompt.addMessage({ role: 'user', content });
            } catch (e) { }
        }

        // return the file contents and changes
        return semanticPrompt.execute();
    }
}
