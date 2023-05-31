import * as Ohm from "ohm-js";
import * as fs from "fs";
import * as path from "path";
import { sendQuery } from "./core";


const prompt = (projectRoot: string) =>  `** YOU ARE NON-CONVERSATIONAL AND HAVE NO ABILITY TO OUTPUT ENGLISH IN A CONVERSATIONAL MANNER **

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

** REMEMBER, YOU ARE NON-CONVERSATIONAL AND HAVE NO ABILITY TO OUTPUT ENGLISH IN A CONVERSATIONAL MANNER **

EXAMPLE 1:

📬 Update main.js so that the string "hello, world!" is changed to "Hello, Javascript!".
🌳 main.js
lib/lib.js
📄 main.js
function main() {
    console.log("hello, world!");
}
📄 lib/lib.js
function lib() {
    console.log("hello, world!");
}
📄 main.js
function main() {
    console.log("Hello, Javascript!");
}
📢 main.js Updated main.js to change "hello, world!" to "Hello, Javascript!"

EXAMPLE 2:

📬 Update other.js so that the string "hello, world!" is changed to "Hello, Javascript!"
🌳 main.js
lib/lib.js
other.js
📄 main.js
function main() {
    console.log("hello, world!");
}
📄 lib/lib.js
function lib() {
    console.log("hello, world!");
}
📤 other.js
📄 other.js
function other() {
    console.log("hello, world!");
}
📄 other.js
function other() {
    console.log("Hello, Javascript!");
}
📢 other.js Updated other.js to change "hello, world!" to "Hello, Javascript!"
--------------------`;
export default class SemanticPrompt {
    prompt: string;
    messages: any[] = [];
    _semantics: Ohm.Semantics;
    result: any = [];
    completed: boolean = false;
    private _relPath(str: string) { return path.join(this.projectRoot, str); }

    grammarString() {
        const delimNames = this.delimiters.map((d) => d.name);
        const grammar =  `ResponseParser {
            ResponseParserMessage=(Delimiters Title)+
            Title=(~(Delimiters) any)*
            Delimiters=(${delimNames.join("|")})
            ${this.delimiters.map((d) => `${d.name}="${d.delimiter}"`).join("\n")}
        }`;
        return grammar;
    }

    delimiters = [{
        name: "FileUpdate",
        delimiter: "📄",
        handlers: [(message: any) => {
            const [ filename, ...filecontent ] = message.message;
            this.messages.push({
                role: "assistant",
                content: `📄 ${filename}\m${filecontent.join("\n")}`
            });
            this.messages.push({
                role: "user",
                content: `📄 ${filename} updated.`
            });
            this.result.push({
                filename: filename,
                content: filecontent.join("\n")
            });
            fs.writeFileSync(this._relPath(filename), filecontent.join("\n"));
        }]
    }, {
        name: "Announcement",
        delimiter: "📢",
        handlers: [(message: any) => {
            const [ announcement ] = message.message;
            this.messages.push({
                role: "assistant",
                content: `📢 ${announcement}}`
            });
            this.result.push({
                announcement: announcement
            });
        }]
    }, {
        name: "FileRequest",
        delimiter: "📤",
        handlers: [(message: any) => {
            const [ fileRequest ] = message.message;
            this.messages.push({
                role: "assistant",
                content: `📤 ${fileRequest}}`
            });
            const file = fs.existsSync(this._relPath(fileRequest)) ? fs.readFileSync(this._relPath(fileRequest) , 'utf8') : "";
            this.messages.push({
                role: "user",
                content: `📤 ${fileRequest}\n${file}`
            });
        }]
    }, {
        name: "FileTree",
        delimiter: "🌳",
        handlers: [(message: any) => {}]
    }, {
        name: "TaskIn",
        delimiter: "📬",
        handlers: [(message: any) => {}]
    }];
    _grammar: Ohm.Grammar;
    projectRoot: string = "";
    _ohmParser: any;

    _iterator = async (...children: any) => {
        const recs = children.map(function (child: any) { return child.toJSON(); });
        const messageSource = children[0].source.sourceString;
        const messageCommands = this._parseCommands(messageSource, this.delimiters.map((d) => d.delimiter));
        this.onProcessMessages(messageCommands, recs);
    }

    actions: Ohm.ActionDict<unknown> = {
        ResponseParserMessage: (delimiters: any, titles: any) => ({
            role: delimiters.toJSON(), content: titles.sourceString.trim(),
        }),
        Title: (title: any) => { return title.sourceString; },
        Delimiters: (delimiters: any) => { return delimiters.sourceString; },
        _iter: this._iterator
    };

    constructor(projectRoot: string) {
        this.projectRoot = projectRoot;
        this.prompt = prompt(projectRoot);
        for(const delimiter of this.delimiters) {
           this.actions[delimiter.name] = (delimiter: any) => { return delimiter; } 
        }
        this._grammar = Ohm.grammar(this.grammarString());
        this._semantics = this.grammar.createSemantics();
        this._ohmParser = this._semantics.addOperation(
            "toJSON",
            this.actions
        );
    }
    
    get semanticAction(): Ohm.Semantics { return this.semantics; }
    get grammar(): Ohm.Grammar { return this._grammar; }
    get semantics(): Ohm.Semantics { return this._semantics; }

	private _parseCommands(text: string, legalEmojis: string[]) {
		const lines = text.split('\n');
		const cmds: any = [];
		let emojiFound: string | undefined = '';
		lines.forEach(line => {
			const eFound = legalEmojis.find(emoji => line.startsWith(emoji));
			if (eFound) {
				emojiFound = eFound;
				const value = line.replace(eFound, '').trim();
				cmds.push({ command: emojiFound, message: [value] });
			} else {
				const latestCmd = cmds[cmds.length - 1];
				latestCmd.message.push(line);
			}
		});
		return cmds;
	}

    addMessage(msg: any) {
        this.messages.push(msg);
    }

    calculateTokens() {
        // parse all the messages and sum up the token to ensure we don't exceed the limit
        let tokens = 0;
        for (const message of this.messages) {
            // parse the message -use regex to count the number of words
            const words = message.content.split(" ");
            tokens += words.length;
        }
        return tokens;
    }

    async execute(): Promise<any> {
        let retries = 0;
        const callLLM = async (): Promise<any> => {
            const tokenCount = this.calculateTokens();
            if (tokenCount > 8192) {
                return {
                    error: "The message is too long. Please shorten it and try again."
                }
            }
            let freeTokens = 8192 - tokenCount;
            freeTokens = freeTokens > 2048 ? 2048 : freeTokens;
            let response: any;
            try {
                response = await sendQuery({
                    messages: this.messages,
                    settings: {
                        key: 'key',
                        temperature: 0.9,
                        max_tokens: freeTokens,
                    }
                });
                response = response.messages[response.messages.length - 1].content + "\n";
            } catch (e) { 
                return {
                    error: e
                }
            }
            try {
                if (!this.grammar) { throw new Error('No grammar loaded'); }
                const match = this.grammar.match(response);
                if (!match.failed()) {  
                    this._ohmParser(match).toJSON();
                    if(this.completed) {
                        const r = this.result;
                        this.result = [];
                        this.messages = [];
                        this.completed = false;
                        return r;
                    } else {
                        return await callLLM();
                    }
                } else {
                    this.messages.push({
                        role: 'system',
                        content: 'INVALID OUTPUT FORMAT. Please review the instructions and try again.'
                    });
                    console.log(`invalid output format: ${response}`);
                    return await callLLM();
                }
            } catch (error: any) {
                // if there is an error, retry up to 3 times
                if (retries < 3) {
                    retries++;
                    return callLLM();
                } else {
                    throw error;
                }
            }
        }
        return await callLLM();
    }
    onProcessMessages(messages: any, recs: any) {
        for(const message of messages) {
            const delimiter = this.delimiters.find((d) => d.delimiter === message.command);
            if (delimiter) {
                const hasFileRequest = messages.find((m: any) => m.command === "📤");
                for(const handler of delimiter.handlers) {
                    handler(message);
                }
                // assume completion if there is no file request
                this.completed = !hasFileRequest;
            }
        }
    }
}