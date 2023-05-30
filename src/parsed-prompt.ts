import * as fs from 'fs';
import * as path from 'path';
import { Conversation } from './types';
import { sendQuery } from './core';

abstract class Agent {
    public readonly fileTree: string[] = [];
    private message: { role: string; content: string; }[] = [];
    public conversation: Conversation;
    constructor(systemMessage: string) {
        this.conversation = {
            messages: this.message,
            settings: {
                key: 'test',
                temperature: 0.7,
                maxTokens: 2048,
                topP: 1,
            }
        };
        this.message.push({ role: 'system', content: systemMessage});
    }

    public reset() {
        this.conversation = {
            messages: [this.message[0]],
            settings: {
                key: 'test',
                temperature: 0.7,
                maxTokens: 2048,
                topP: 1,
            }
        };
    }

    public parseFromDelimiters(text: string, delimiters: string[]): { delimiter: string, value: string }[] {
        const result: any = [];
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

    async request(ask: string, act: boolean = true) {
        this.message.push({ role: 'user', content: ask });
        const height = this.message.length;
        // send the query to the assistant
        const response = await sendQuery(this.conversation);
        // get the assistant's response
        const trimmedResponse = response.messages
        .slice(height, response.messages.length)
        .filter((message: any) => 
            message.role === 'assistant'
        );
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
       
        }

        // return the file contents and changes
        return { fileContents, fileChanges };
    }

    public abstract setProjectFiles(files: string[]): void;
}