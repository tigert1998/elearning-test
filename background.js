importScripts('xlsx.full.min.js');

// 监听来自content_script.js的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    searchInExcel(request.searchTerm).then((results) => {
        sendResponse({ results: results, error: null });
    }).catch((error) => {
        sendResponse({ results: null, error: error.stack });
    });

    return true; // 保持连接开放以支持异步响应
});

chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "llm") {
        port.onMessage.addListener((msg) => {
            sendStreamingLLMRequest(msg.text, (reasoningContent, content) => {
                port.postMessage({ reasoningContent, content, error: null });
            }).catch((error) => {
                port.postMessage({ reasoningContent: null, content: null, error: error.stack });
            });
        });
    }
});

let parseThinkTags = (reasoningContent, content) => {
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

let constructPrompt = (text) => {
    return `使用中文对以下问题进行简要解答：\n${text}`;
};

let sendStreamingLLMRequestOpenAI = async (llmConfig, text, callback) => {
    let headers = { 'Content-Type': 'application/json' };
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
                    content: constructPrompt(text)
                }
            ],
            stream: true
        })
    };
    let response = await fetch(llmConfig.url, options);

    if (!response.ok) throw new Error(`HTTP error with status: ${response.status}`);

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
            if (message === "[DONE]") return;

            const parsed = JSON.parse(message);
            reasoningContent += parsed.choices[0]?.delta?.reasoning_content || "";
            content += parsed.choices[0]?.delta?.content || "";

            let thinkTagsParsed = parseThinkTags(reasoningContent, content);
            if (thinkTagsParsed.reasoningContent.length + thinkTagsParsed.content.length > 0) {
                callback(thinkTagsParsed.reasoningContent, thinkTagsParsed.content);
            }
        }
    }
};

let sendStreamingLLMRequestBailian = async (llmConfig, text, callback) => {
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
            message: { "text": constructPrompt(text) }
        })
    };
    response = await fetch(llmConfig.run_url, options);
    if (!response.ok) throw new Error(`HTTP error to visit ${llmConfig.run_url} with status: ${response.status}`);

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
            if (parsed.object === "complete") return;

            content += parsed.content[0]?.text?.value || "";
            let thinkTagsParsed = parseThinkTags(reasoningContent, content);

            if (thinkTagsParsed.reasoningContent.length + thinkTagsParsed.content.length > 0) {
                callback(thinkTagsParsed.reasoningContent, thinkTagsParsed.content);
            }
        }
    }
};

let sendStreamingLLMRequest = async (text, callback) => {
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

let searchInExcel = async (searchTerm) => {
    let regExp = new RegExp(searchTerm, "gi");

    let fileList = await new Promise((resolve, reject) => {
        chrome.storage.local.get('eLearningTestFileList', (result) => {
            let fileList = result.eLearningTestFileList;
            if (fileList == null) reject(new Error("Sheet list is not prepared"));
            else resolve(fileList);
        });
    });

    let arrays = await Promise.all(fileList.map(async (pair) => {
        let file = pair[0];
        let enabled = pair[1];
        if (!enabled) return [];
        const fileUrl = chrome.runtime.getURL(`tiku/${file}`);
        const response = await fetch(fileUrl);

        if (!response.ok) return Promise.reject(new Error(`Fail to load file: ${file}`));

        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });

        let results = [];

        // 遍历所有工作表
        for (let sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            const sheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            if (sheetData.length === 0) continue;
            let headers = sheetData[0];
            if (headers.includes(undefined) || headers.includes(null))
                return Promise.reject(new Error(`Sheet ${sheetName} in ${file} contains empty header`));
            headers = headers.map((header) => String(header).trim());
            if ((new Set(headers)).size != headers.length)
                return Promise.reject(new Error(`Sheet ${sheetName} in ${file} contains duplicate headers`));

            for (let i = 1; i < sheetData.length; i++) {
                let cells = sheetData[i];
                if (cells.some((cell) => cell != null && String(cell).match(regExp))) {
                    let row = headers.map((header, idx) => [header, cells[idx]]);
                    results.push({
                        rowIndex: i - 1,
                        row: row,
                        file: file,
                        sheet: sheetName
                    });
                }
            }
        };

        return results;
    }));

    let results = [];
    arrays.forEach((arr) => results = results.concat(arr));
    return results;
}
