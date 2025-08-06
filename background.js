importScripts('xlsx.full.min.js');

// 监听来自content_script.js的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    let promise = null;
    if (request.queryType === "local") promise = searchInExcel(request.searchTerm);
    else if (request.queryType === "llm") promise = sendLLMRequest(request.text);
    if (promise == null) return false;

    promise.then((results) => {
        sendResponse({ results: results, error: null });
    }).catch((error) => {
        sendResponse({ results: null, error: error.stack });
    });

    return true; // 保持连接开放以支持异步响应
});

let sendLLMRequest = async (text) => {
    let fileUrl = chrome.runtime.getURL("llm-config.json");
    let response = await fetch(fileUrl);
    let llmConfig = await response.json();
    let options = {
        method: 'POST',
        headers: { Authorization: `Bearer ${llmConfig.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: llmConfig.model,
            messages: [
                {
                    role: "user",
                    content: `对以下问题进行简要解答：\n${text}`
                }
            ]
        })
    };
    response = await fetch(llmConfig.url, options);
    let data = await response.json();
    return data.choices[0].message.content;
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
