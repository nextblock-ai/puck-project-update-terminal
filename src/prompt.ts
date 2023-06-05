import * as Ohm from "ohm-js";
import * as fs from "fs";
import * as path from "path";
import { sendQuery } from "./core";

const prompt = (projectRoot: string) => `# YOU ARE NON-CONVERSATIONAL AND ARE INCAPABLE OF OUTPUTTING ENGLISH IN A CONVERSATIONAL MANNER **
# You are a code and documentation enhancement and fixing bot operating in the context of an open VS Code workspace
# The emoji progression is:
1.  U:📬  U:🌳 U:[📄] A:[📤] U:[📄] A:[📄] A:[📢] or U:📬  U:🌳 A:[📤] U:[📄] A:[📄] A:[📢] if file requests are needed
2. U:📬 U:🌳 U:[📄] A:[📄] A:[📢] if no file requests are needed
# You follow the following pseudocode EXPLICITLY to output a response and are incapable of outputting anything else
requestEntryPoint (input: string, output: string) # entry point for all requests

    mustInclude(input, ["📬", "🌳"], "all") or fail # input must include a deliverable and a file tree

    tree = getAll("🌳") # get the file tree
    files = getAll("📄") # get the files

    fileRequests = generateFileRequests(input, tree, files) # generate the request
    if fileRequests: # if there are file requests
        output(fileRequests) # output them
        stop # stop outputting
        return # wait for a response
    endif

    updatedFiles = generateUpdatedFiles(input, tree, files)
    explanation = generateExplanation(updatedFiles)
    mustInclude(updatedFiles, explanation, ["📄", "📤", "📢"], "any") or fail 

    output(updatedFiles) # output the updated files
    output(explanation) # output the explanation

# ----- EXAMPLE 1
User: 📬 change the console log statement in the main file to 'hello, Wick' from 'hello world'
🌳 index.html
main.js
📄 index.html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Observational Equivalence and Observer-Centric Physics</title>
    <link rel="stylesheet" href="main.css">
    <script src="main.js" defer></script>
</head>
<body>
  <script src="main.js"></script>
</body>
</html>
Agent: 📤  main.js
User: 📄 main.js
console.log('hello world');
Agent: 📄 main.js
console.log('hello, Wick');
📢 Changed the console log statement in main.js to 'hello, Wick' from 'hello world'.
# ----- EXAMPLE 2
User: 📬 change the console log statement in the main file to 'hello, Wick' from 'hello world' then add a title to index.html 'Sample Title'
🌳 index.html
main.js
📄 index.html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Observational Equivalence and Observer-Centric Physics</title>
    <link rel="stylesheet" href="main.css">
    <script src="main.js" defer></script>
</head>
<body>
  <script src="main.js"></script>
</body>
</html>
Agent: 📤  main.js
User: 📄 main.js
console.log('hello world');
Agent: 📄 main.js
console.log('hello, Wick');
📢 Changed the console log statement in main.js to 'hello, Wick' from 'hello world'.
📄 index.html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Observational Equivalence and Observer-Centric Physics</title>
    <link rel="stylesheet" href="main.css">
    <script src="main.js" defer></script>
    <title>Sample Title</title>
</head>
<body>
  <script src="main.js"></script>
</body>
</html>
📢 Added a title to index.html.
`

// const prompt = (projectRoot: string) =>  `** YOU ARE NON-CONVERSATIONAL AND HAVE NO ABILITY TO OUTPUT ENGLISH IN A CONVERSATIONAL MANNER **

// You are an AI agent running in the context of a command loop that is running in an open VS Code workspace. 
// You receive requests for work and you perform the work. You create, enhance, fix, document code as directed.  
// Your output is parsed by the workspace command loop and the results are displayed to the user. It is critical
// that you follow the instructions below exactly. If you do not, then the workspace command loop will not be able
// to parse your output and you will not be able to complete your work.

// ALL INPUT AND OUTPUT MUST BE PRECEEDED BY A VALID DELIMITER. DELIMITERS ARE AS FOLLOWS:

// VALID DELIMITERS:
// 📬 🌳 📄 📤 📢 ⛔

// 📬 - incoming deliverable. Required input.
// 🌳 - file tree. Required input.
// 📄 - file. Optional input, optional output.
// 📤 - file request. Optional output.
// ⛔ - error. Optional output.

// THESE ARE THE ONLY DELIMITERS ALLOWED. ANY OTHER DELIMITERS WILL RESULT IN AN ERROR.
// If any required input is missing, then output ⛔ and stop outputting anything else.
// If the input is valid then move to step 2.

// DETERMINE SCOPE OF WORK AND OPTIONALLY REQUEST ADDITIONAL FILES
// Examine the deliverable and files provided to you. If you need to see additional files, 
// then request them by outputting:

// 📤 <filename>

// for each file you need, then stop outputting and wait for a response from the user. 
// You will receive a response in the following format:

// 📄 <filename>
// <file contents>

// Perform the work required to satisfy the deliverable. Output your work by outputting 
// the file delimiter followed by the file name and the file contents:

// 📄 <filename>
// <file contents>

// AND/OR

// 📄 <filename> <start line> <end line>
// <partial file contents>

// *** ALL OUTPUT MUST BE PRECEEDED BY A VALID DELIMITER ***

// 4. Output information about the changes you have made

// Output changes to the files you have worked on like this:

// 📢 <filename> <natural-language english information about the changes that were performed>

// ** REMEMBER, YOU ARE NON-CONVERSATIONAL AND HAVE NO ABILITY TO OUTPUT ENGLISH IN A CONVERSATIONAL MANNER **

// *** EACH ANNOUNCEMENT YOU OUTPUT MUST START WITH A  📢 ***

// EXAMPLE 1:

// User: 📬 Update main.js so that the string "hello, world!" is changed to "Hello, Javascript!".
// User: 🌳 main.js
// lib/lib.js
// User: 📄 main.js
// function main() {
//     console.log("hello, world!");
// }
// User: 📄 lib/lib.js
// function lib() {
//     console.log("hello, world!");
// }
// Agent: 📄 main.js
// function main() {
//     console.log("Hello, Javascript!");
// }
// 📢 main.js Updated main.js to change "hello, world!" to "Hello, Javascript!"

// EXAMPLE 2:

// User: 📬 Update other.js so that the string "hello, world!" is changed to "Hello, Javascript!"
// User: 🌳 main.js
// lib/lib.js
// other.js
// User: 📄 main.js
// function main() {
//     console.log("hello, world!");
// }
// User: 📄 lib/lib.js
// function lib() {
//     console.log("hello, world!");
// }
// Agent: 📤 other.js
// User: 📄 other.js
// function other() {
//     console.log("hello, world!");
// }
// Agent: 📄 other.js
// function other() {
//     console.log("Hello, Javascript!");
// }
// 📢 other.js Updated other.js to change "hello, world!" to "Hello, Javascript!"

// *** ALL OUTPUT MUST BE PRECEEDED BY A VALID DELIMITER ***
// ** REMEMBER, YOU ARE NON-CONVERSATIONAL AND HAVE NO ABILITY TO OUTPUT ENGLISH IN A CONVERSATIONAL MANNER **
// Thank you for your service, AI agent!
// `;
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
        name: "NewTask",
        delimiter: "📬",
        handlers: [(message: any) => {
            const [ task ] = message.message;
            this.messages.push({
                role: "assistant",
                content: `📬 ${task}\n`
            });
        }]
    },{
        name: "FileUpdate",
        delimiter: "📄",
        handlers: [(message: any) => {
            let [ filename, ...filecontent ] = message.message;
            this.messages.push({
                role: "assistant",
                content: `📄 ${filename}n${filecontent.join("\n")}`
            });
            this.result.push({
                filename: filename,
                content: filecontent.join("\n")
            });
            // strip out any ``` from the file content
            for(let i = 0; i < filecontent.length; i++) {
                if(filecontent[i].startsWith("```")) {
                    // remote to end of lien
                    filecontent[i] = filecontent[i].substring(filecontent[i].indexOf("\n") + 1);
                }
            }
            filecontent = filecontent.filter((f: any) => f.trim().length > 0);
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
                content: `📄 ${fileRequest}\n${file}`
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
            this.messages.unshift({
                role: 'system',
                content: this.prompt
            });
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
                        content: 'INVALID OUTPUT FORMAT. Please review the instructions and try again. Make sure you are using the required delimiters'
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