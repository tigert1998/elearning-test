import * as XLSX from "xlsx";
import { CheckboxConfig, CheckboxListConfig, SearchInExcelRow, ServiceWorkerRequestMessage, ServiceWorkerResponseMessage } from "./common";

chrome.runtime.onMessage.addListener((
    request: ServiceWorkerRequestMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: ServiceWorkerResponseMessage) => void
) => {
    if (request.bankSearchTerm != null) {
        searchInExcel(request.bankSearchTerm).then((rows) => {
            sendResponse({ searchInExcelRows: rows });
        }).catch((error) => {
            sendResponse({ error: error.stack });
        });
    } else if (request.llmAutoSolve != null) {
        llmAutoSolve(request.llmAutoSolve.type, request.llmAutoSolve.problem, request.llmAutoSolve.options).then((response) => {
            sendResponse(response);
        }).catch((error) => {
            sendResponse({ error: error.stack });
        });
    }

    return true;
});

chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "llm") {
        port.onMessage.addListener((msg) => {
            let prompt = `使用中文对以下问题进行简要解答：\n${msg.text}`;
            sendStreamingLLMRequest(prompt, (reasoningContent: string, content: string, done: boolean) => {
                port.postMessage({ reasoningContent, content, error: null });
            }).catch((error) => {
                port.postMessage({ reasoningContent: null, content: null, error: error.stack });
            });
        });
    }
});

let llmAutoSolve = async (type: string, problem: string, options: string[]): Promise<ServiceWorkerResponseMessage> => {
    let questionType = type === "radio" ? "单项选择题（有且仅有一项答案）" : "多选题（至少有两项答案）";
    let prompt = `【任务】解答以下${questionType}：\n【题干】${problem}`;
    options.forEach((option, index) => {
        prompt += `【选项${index}】${option}\n`;
    });
    prompt += `【要求】不要输出思考内容和其他内容，仅以JSON数组格式返回输出结果，例如答案为选项1、选项2，则仅返回JSON数组[1, 2]`;

    return new Promise((resolve, reject) => {
        sendStreamingLLMRequest(prompt, (reasoningContent: string, content: string, done: boolean) => {
            if (!done) return;
            let match = content.match(/```json(.+)```/);
            if (match != null) content = match[1];

            try {
                let array = JSON.parse(content);
                for (let i = 0; i < array.length; i++) {
                    array[i] = parseInt(array[i]);
                }
                resolve({ llmAutoSolveResult: array });
            } catch (e) {
                reject(e as Error);
            }
        }).catch((error) => {
            reject(error);
        });
    });
};

let parseThinkTags = (reasoningContent: string, content: string) => {
    // parse <think> and </think> tags
    if (reasoningContent.length > 0) {
        return { reasoningContent, content };
    }
    let match = content.match(/<think>(.*)<\/think>(.*)/s);
    if (match) {
        reasoningContent = match[1];
        content = match[2];
    } else {
        let match = content.match(/<think>(.*)/s);
        if (match) {
            reasoningContent = match[1];
            content = "";
        }
    }
    return { reasoningContent, content };
}

type LLMQueryCallback = (reasoningContent: string, content: string, done: boolean) => void;

let sendStreamingLLMRequestOpenAI = async (
    llmConfig: { url: string, model: string, token?: string }, text: string, callback: LLMQueryCallback
) => {
    let headers: { "Content-Type": string, Authorization?: string } = { 'Content-Type': 'application/json' };
    if (llmConfig.token) {
        headers.Authorization = `Bearer ${llmConfig.token}`;
    }
    let options = {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model: llmConfig.model,
            messages: [
                {
                    role: "user",
                    content: text
                }
            ],
            stream: true
        })
    };
    let response = await fetch(llmConfig.url, options);

    if (!response.ok) throw new Error(`HTTP error with status: ${response.status}`);

    if (response.body == null) {
        throw new Error("Response body is null");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');

    let reasoningContent = "";
    let content = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
            const message = line.replace(/^data: /, '');
            if (message === "[DONE]") {
                let thinkTagsParsed = parseThinkTags(reasoningContent, content);
                callback(thinkTagsParsed.reasoningContent, thinkTagsParsed.content, true);
                return;
            }

            const parsed = JSON.parse(message);
            reasoningContent += parsed.choices[0]?.delta?.reasoning_content || "";
            content += parsed.choices[0]?.delta?.content || "";

            let thinkTagsParsed = parseThinkTags(reasoningContent, content);
            if (thinkTagsParsed.reasoningContent.length + thinkTagsParsed.content.length > 0) {
                callback(thinkTagsParsed.reasoningContent, thinkTagsParsed.content, false);
            }
        }
    }
};

let sendStreamingLLMRequestBailian = async (
    llmConfig: { create_session_url: string, run_url: string, key: string, agent_code: string, agent_version: string },
    text: string, callback: LLMQueryCallback
) => {
    let options = {
        method: 'POST',
        headers: { Authorization: `Bearer ${llmConfig.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            agentCode: llmConfig.agent_code,
            agentVersion: llmConfig.agent_version
        })
    };
    let response = await fetch(llmConfig.create_session_url, options);
    if (!response.ok) throw new Error(`HTTP error to visit ${llmConfig.create_session_url} with status: ${response.status}`);
    let uniqueCode = (await response.json())["data"]["uniqueCode"];

    options = {
        method: 'POST',
        headers: { Authorization: `Bearer ${llmConfig.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            stream: true,
            delta: true,
            sessionId: uniqueCode,
            message: { "text": text }
        })
    };
    response = await fetch(llmConfig.run_url, options);
    if (!response.ok) throw new Error(`HTTP error to visit ${llmConfig.run_url} with status: ${response.status}`);

    if (response.body == null) {
        throw new Error("Response body is null");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');

    let reasoningContent = "";
    let content = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
            const message = line.replace(/^data:/, '');
            const parsed = JSON.parse(message);
            if (parsed.object === "complete") {
                let thinkTagsParsed = parseThinkTags(reasoningContent, content);
                callback(thinkTagsParsed.reasoningContent, thinkTagsParsed.content, true);
                return;
            }

            content += parsed.content[0]?.text?.value || "";
            let thinkTagsParsed = parseThinkTags(reasoningContent, content);
            if (thinkTagsParsed.reasoningContent.length + thinkTagsParsed.content.length > 0) {
                callback(thinkTagsParsed.reasoningContent, thinkTagsParsed.content, false);
            }
        }
    }
};

let sendStreamingLLMRequest = async (text: string, callback: LLMQueryCallback) => {
    let fileUrl = chrome.runtime.getURL("llm-config.json");
    let response = await fetch(fileUrl);
    let llmConfig = await response.json();
    let choice = llmConfig.choice;
    let profile = llmConfig.profiles[choice];
    if (profile.type === "openai") {
        return sendStreamingLLMRequestOpenAI(profile, text, callback);
    } else if (profile.type === "bailian") {
        return sendStreamingLLMRequestBailian(profile, text, callback);
    }
};

let searchInExcel = async (searchTerm: string): Promise<SearchInExcelRow[]> => {
    let regExp = new RegExp(searchTerm, "gi");

    let fileList: CheckboxListConfig = await new Promise((resolve, reject) => {
        chrome.storage.local.get('eLearningTestFileList', (result) => {
            let fileList = result.eLearningTestFileList;
            if (fileList == null) reject(new Error("Sheet list is not prepared"));
            else resolve(fileList);
        });
    });

    let arrays = await Promise.all(fileList.map(async (pair) => {
        let file = pair.name;
        let enabled = (pair as CheckboxConfig).checked;
        if (!enabled) return [];
        const fileUrl = chrome.runtime.getURL(`tiku/${file}`);
        const response = await fetch(fileUrl);

        if (!response.ok) return Promise.reject(new Error(`Fail to load file: ${file}`));

        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });

        let results: SearchInExcelRow[] = [];

        // 遍历所有工作表
        for (let sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            const sheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            if (sheetData.length === 0) continue;
            let headers_raw = sheetData[0] as any[];
            if (headers_raw.includes(undefined) || headers_raw.includes(null))
                return Promise.reject(new Error(`Sheet ${sheetName} in ${file} contains empty header`));
            let headers = headers_raw.map((header: any) => String(header).trim());
            if ((new Set(headers)).size != headers.length)
                return Promise.reject(new Error(`Sheet ${sheetName} in ${file} contains duplicate headers`));

            for (let i = 1; i < sheetData.length; i++) {
                let values = sheetData[i] as any[];
                if (values.some((value) => value != null && String(value).match(regExp))) {
                    results.push({
                        rowIndex: i - 1,
                        headers,
                        values,
                        file,
                        sheet: sheetName
                    });
                }
            }
        };

        return results;
    }));

    let results: SearchInExcelRow[] = [];
    arrays.forEach((arr) => results = results.concat(arr));
    return results;
}
